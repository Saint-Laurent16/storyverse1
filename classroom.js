import { supabase, supabaseConfigured } from './supabase-client.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (v = '') => String(v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const ACTIVE_CLASS_KEY = 'storyverse-active-class-v1';
const GOOGLE_ROLE_KEY = 'storyverse-google-requested-role-v1';
let currentUser = null;
let currentProfile = null;
let authMode = 'login';
let selectedTeacherClass = null;
let selectedStudentClass = null;
let storyCatalog = [];

function notify(message, kind = 'ok') {
  const el = $('#pageNotice');
  el.hidden = false;
  el.className = `notice ${kind === 'error' ? 'notice-warn' : ''}`;
  el.textContent = message;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function clearNotice() { $('#pageNotice').hidden = true; }
function setBusy(button, busy, label) {
  if (!button) return;
  if (busy) { button.dataset.originalText = button.textContent; button.disabled = true; button.textContent = label || 'PLEASE WAIT…'; }
  else { button.disabled = false; button.textContent = button.dataset.originalText || button.textContent; }
}
function setAuthMode(mode) {
  authMode = mode;
  $('#loginTab').classList.toggle('active', mode === 'login');
  $('#signupTab').classList.toggle('active', mode === 'signup');
  $('#nameField').hidden = mode !== 'signup';
  $('#roleField').hidden = mode !== 'signup';
  $('#authSubmit').innerHTML = mode === 'login' ? 'LOG IN <span>→</span>' : 'CREATE ACCOUNT <span>→</span>';
  $('#authFoot').textContent = mode === 'login'
    ? 'Your account keeps your own classroom activity connected across devices.'
    : 'Students can join with a class code. Teacher accounts need project-admin approval.';
  $('#password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  clearNotice();
  const email = $('#email').value.trim();
  const password = $('#password').value;
  const button = $('#authSubmit');
  setBusy(button, true);
  try {
    if (authMode === 'login') {
      sessionStorage.removeItem(GOOGLE_ROLE_KEY);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      notify('You are signed in. Welcome back!');
    } else {
      const displayName = $('#displayName').value.trim() || 'Story Explorer';
      const requestedRole = $('#requestedRole').value;
      if (password.length < 8) throw new Error('Please use a password with at least 8 characters.');
      const redirectTo = new URL('./classroom.html', window.location.href).href;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName, requested_role: requestedRole },
          emailRedirectTo: redirectTo,
        },
      });
      if (error) throw error;
      if (data.session) {
        notify(requestedRole === 'teacher'
          ? 'Account created. Teacher access is pending administrator approval.'
          : 'Account created. You can now join your teacher’s classroom.');
      } else {
        notify('Account created! Check your email to confirm the account, then log in.');
      }
    }
  } catch (error) {
    notify(error.message || 'We could not complete that request. Please try again.', 'error');
  } finally {
    setBusy(button, false);
  }
}

async function handleGoogleAuth() {
  clearNotice();
  const role = $('#googleRole').value;
  const button = $('#googleAuthButton');
  setBusy(button, true, 'CONNECTING…');
  sessionStorage.setItem(GOOGLE_ROLE_KEY, role);
  try {
    const redirectTo = new URL('./classroom.html', window.location.href).href;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) throw error;
  } catch (error) {
    sessionStorage.removeItem(GOOGLE_ROLE_KEY);
    notify(error.message || 'Google sign-in could not start. Check that Google is enabled in Supabase.', 'error');
    setBusy(button, false);
  }
}

async function applyPendingGoogleRole(user) {
  const requestedRole = sessionStorage.getItem(GOOGLE_ROLE_KEY);
  if (!requestedRole || !user) return;
  const { error } = await supabase.rpc('set_storyverse_requested_role', {
    p_requested_role: requestedRole,
  });
  if (error) throw error;
  sessionStorage.removeItem(GOOGLE_ROLE_KEY);
}

async function loadProfile(user) {
  const { data, error } = await supabase.from('profiles').select('id,display_name,role,requested_role').eq('id', user.id).single();
  if (error) throw error;
  return data;
}

async function renderSignedIn(user) {
  currentUser = user;
  $('#authPanel').hidden = true;
  $('#appPanel').hidden = false;
  $('#welcomeName').textContent = 'reader';
  $('#teacherPanel').hidden = true;
  $('#studentPanel').hidden = true;
  try {
    currentProfile = await loadProfile(user);
    $('#welcomeName').textContent = currentProfile.display_name || user.email || 'reader';
    if (currentProfile.role === 'teacher') {
      $('#roleLabel').textContent = 'TEACHER DASHBOARD';
      $('#welcomeSub').textContent = 'Manage your private classes and review reading growth.';
      $('#teacherPanel').hidden = false;
      await loadTeacherClasses();
    } else if (currentProfile.requested_role === 'teacher') {
      $('#roleLabel').textContent = 'TEACHER ACCESS PENDING';
      $('#welcomeSub').textContent = 'Your teacher-access request is waiting for approval by the project administrator.';
      notify('Your teacher account is pending approval. Ask the STORYVERSE project administrator to activate it before creating classes.', 'error');
    } else {
      $('#roleLabel').textContent = 'STUDENT DASHBOARD';
      $('#welcomeSub').textContent = 'Join a private class and open the stories assigned by your teacher.';
      $('#studentPanel').hidden = false;
      await loadStudentClasses();
    }
  } catch (error) {
    notify(`${error.message || 'Could not load your account.'} Check that the Supabase SQL setup was completed.`, 'error');
  }
}

async function loadTeacherClasses() {
  const list = $('#teacherClassList');
  list.innerHTML = '<p class="empty-state loading">Loading your classrooms…</p>';
  const { data, error } = await supabase.from('classrooms')
    .select('id,name,grade_level,class_code,created_at')
    .eq('teacher_id', currentUser.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!data.length) {
    list.innerHTML = '<p class="empty-state">No classrooms yet. Create your first class above.</p>';
    $('#teacherClassDetail').hidden = true;
    return;
  }
  list.innerHTML = data.map(c => `
    <button type="button" class="class-card ${selectedTeacherClass === c.id ? 'selected' : ''}" data-teacher-class="${esc(c.id)}">
      <div class="small-meta"><span>${esc(c.grade_level)}</span><span>PRIVATE CLASS</span></div>
      <h3>${esc(c.name)}</h3><p>Created ${new Date(c.created_at).toLocaleDateString()}</p>
      <span class="card-code">${esc(c.class_code)}</span>
    </button>`).join('');
  $$('[data-teacher-class]', list).forEach(btn => btn.addEventListener('click', () => openTeacherClass(btn.dataset.teacherClass)));
  if (selectedTeacherClass && data.some(c => c.id === selectedTeacherClass)) await openTeacherClass(selectedTeacherClass);
  else await openTeacherClass(data[0].id);
}

async function createClass(event) {
  event.preventDefault();
  clearNotice();
  const button = $('#createClassForm button[type="submit"]');
  setBusy(button, true, 'CREATING…');
  try {
    const { data, error } = await supabase.rpc('create_storyverse_class', {
      p_name: $('#className').value.trim(),
      p_grade_level: $('#gradeLevel').value,
    });
    if (error) throw error;
    const created = Array.isArray(data) ? data[0] : data;
    if (!created?.class_id) throw new Error('The class was created but its details could not be read. Refresh the page.');
    $('#className').value = '';
    selectedTeacherClass = created.class_id;
    notify(`Class created! Share code ${created.class_code} only with your students.`);
    await loadTeacherClasses();
  } catch (error) {
    notify(error.message || 'Could not create the class.', 'error');
  } finally { setBusy(button, false); }
}

async function openTeacherClass(classId) {
  selectedTeacherClass = classId;
  const detail = $('#teacherClassDetail');
  detail.hidden = false;
  detail.innerHTML = '<div class="detail-shell"><p class="empty-state">Loading class data…</p></div>';
  const { data: classRows, error: classError } = await supabase.from('classrooms')
    .select('id,name,grade_level,class_code,created_at')
    .eq('id', classId).limit(1);
  if (classError) throw classError;
  const classroom = classRows?.[0];
  if (!classroom) throw new Error('Class not found or you do not have access.');

  const [{ data: members, error: memberError }, { data: assignments, error: assignmentError }, { data: stories }] = await Promise.all([
    supabase.from('class_members').select('student_id,joined_at,profiles!class_members_student_id_fkey(display_name)').eq('class_id', classId).order('joined_at'),
    supabase.from('story_assignments').select('story_id').eq('class_id', classId),
    Promise.resolve({ data: storyCatalog }),
  ]);
  if (memberError) throw memberError;
  if (assignmentError) throw assignmentError;
  const [{ data: scenes, error: scenesError }, { data: attempts, error: attemptsError }, { data: assessmentRows, error: assessmentError }] = await Promise.all([
    supabase.from('scene_progress').select('student_id,story_id,scenes_completed').eq('class_id', classId),
    supabase.from('quiz_attempts').select('student_id,story_id,score,total,completed_at').eq('class_id', classId).order('completed_at', { ascending: false }),
    supabase.from('assessment_scores').select('student_id,phase,score,max_score').eq('class_id', classId),
  ]);
  if (scenesError) throw scenesError;
  if (attemptsError) throw attemptsError;
  if (assessmentError) throw assessmentError;

  const assigned = new Set((assignments || []).map(a => a.story_id));
  const membersHtml = (members || []).map(member => {
    const id = member.student_id;
    const name = member.profiles?.display_name || 'Student';
    const studentScenes = (scenes || []).filter(s => s.student_id === id);
    const sceneCount = studentScenes.reduce((sum, row) => sum + Number(row.scenes_completed || 0), 0);
    const totalScenes = Math.max(1, assigned.size * 3);
    const studentAttempts = (attempts || []).filter(a => a.student_id === id);
    const average = studentAttempts.length
      ? Math.round(studentAttempts.reduce((sum, a) => sum + (a.score / a.total * 100), 0) / studentAttempts.length)
      : null;
    const pre = (assessmentRows || []).find(a => a.student_id === id && a.phase === 'pre');
    const post = (assessmentRows || []).find(a => a.student_id === id && a.phase === 'post');
    const prePercent = pre ? Number(pre.score) / Number(pre.max_score) * 100 : null;
    const postPercent = post ? Number(post.score) / Number(post.max_score) * 100 : null;
    const delta = prePercent !== null && postPercent !== null ? postPercent - prePercent : null;
    return `<tr>
      <td><strong>${esc(name)}</strong><div class="muted">${esc(id.slice(0, 8))}</div></td>
      <td>${sceneCount}/${totalScenes} scenes</td>
      <td>${average === null ? '—' : `${average}%`}<div class="muted">${studentAttempts.length} attempt(s)</div></td>
      <td><input aria-label="Pre-test score percentage for ${esc(name)}" type="number" min="0" max="100" step="0.1" value="${prePercent === null ? '' : prePercent.toFixed(1)}" placeholder="0–100" data-pre="${esc(id)}"></td>
      <td><input aria-label="Post-test score percentage for ${esc(name)}" type="number" min="0" max="100" step="0.1" value="${postPercent === null ? '' : postPercent.toFixed(1)}" placeholder="0–100" data-post="${esc(id)}"></td>
      <td class="${delta === null ? 'muted' : delta >= 0 ? 'change-positive' : 'change-negative'}">${delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} pp`}</td>
      <td><button class="save-score" type="button" data-save-scores="${esc(id)}">SAVE</button></td>
    </tr>`;
  }).join('');

  detail.innerHTML = `
    <div class="detail-shell">
      <div class="detail-head"><div><div class="card-eyebrow">CLASSROOM OVERVIEW</div><h3>${esc(classroom.name)}</h3><p>${esc(classroom.grade_level)} · ${(members || []).length} learner(s)</p></div>
        <div class="code-box"><span>${esc(classroom.class_code)}</span><button type="button" id="copyClassCode">COPY</button></div>
      </div>
      <h4 class="section-mini-title">Assign storybooks</h4>
      <div class="assignment-list">${(stories || []).map(story => `<label class="assignment-chip"><input type="checkbox" data-assign-story="${esc(story.id)}" ${assigned.has(story.id) ? 'checked' : ''}> ${esc(story.title)}</label>`).join('')}</div>
      <h4 class="section-mini-title">Student reading and comprehension progress</h4>
      ${(members || []).length ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>STUDENT</th><th>SCENES COMPLETED</th><th>AVG. STORY QUIZ</th><th>PRE-TEST %</th><th>POST-TEST %</th><th>CHANGE</th><th>ACTION</th></tr></thead><tbody>${membersHtml}</tbody></table></div>` : '<p class="empty-state">No students yet. Share the class code so students can join.</p>'}
      <p class="research-hint">Enter approved pre-test and post-test percentages from the same assessment scale (0–100). The change is shown in percentage points (pp). Story quiz averages are separate and should not be treated as a standardized reading-comprehension measure.</p>
    </div>`;

  $('#copyClassCode').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(classroom.class_code); notify('Class code copied. Share it privately with your students.'); }
    catch { notify(`Class code: ${classroom.class_code}`, 'error'); }
  });
  $$('[data-assign-story]', detail).forEach(input => input.addEventListener('change', () => changeAssignment(classId, input.dataset.assignStory, input.checked)));
  $$('[data-save-scores]', detail).forEach(button => button.addEventListener('click', () => saveAssessmentScores(classId, button.dataset.saveScores, button)));
  $$('#teacherClassList .class-card').forEach(btn => btn.classList.toggle('selected', btn.dataset.teacherClass === classId));
}

async function changeAssignment(classId, storyId, shouldAssign) {
  try {
    if (shouldAssign) {
      const { error } = await supabase.from('story_assignments').upsert({ class_id: classId, story_id: storyId }, { onConflict: 'class_id,story_id', ignoreDuplicates: true });
      if (error) throw error;
    } else {
      const { error } = await supabase.from('story_assignments').delete().eq('class_id', classId).eq('story_id', storyId);
      if (error) throw error;
    }
    notify('Story assignments updated.');
    await openTeacherClass(classId);
  } catch (error) { notify(error.message || 'Could not update story assignments.', 'error'); }
}

async function saveAssessmentScores(classId, studentId, button) {
  try {
    const preInput = $(`[data-pre="${studentId}"]`);
    const postInput = $(`[data-post="${studentId}"]`);
    const rows = [];
    for (const [phase, input] of [['pre', preInput], ['post', postInput]]) {
      const raw = input.value.trim();
      if (!raw) continue;
      const score = Number(raw);
      if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error('Assessment percentages must be between 0 and 100.');
      rows.push({ class_id: classId, student_id: studentId, phase, score, max_score: 100, updated_at: new Date().toISOString() });
    }
    if (!rows.length) throw new Error('Enter a pre-test or post-test percentage first.');
    setBusy(button, true, 'SAVING…');
    const { error } = await supabase.from('assessment_scores').upsert(rows, { onConflict: 'class_id,student_id,phase' });
    if (error) throw error;
    notify('Pre-test/post-test scores saved.');
    await openTeacherClass(classId);
  } catch (error) { notify(error.message || 'Could not save assessment scores.', 'error'); }
  finally { setBusy(button, false); }
}

async function joinClass(event) {
  event.preventDefault();
  clearNotice();
  const button = $('#joinClassForm button[type="submit"]');
  setBusy(button, true, 'JOINING…');
  try {
    const code = $('#classCode').value.trim().toUpperCase();
    const { data, error } = await supabase.rpc('join_storyverse_class', { p_code: code });
    if (error) throw error;
    const joined = Array.isArray(data) ? data[0] : data;
    $('#classCode').value = '';
    selectedStudentClass = joined.class_id;
    localStorage.setItem(ACTIVE_CLASS_KEY, joined.class_id);
    notify(`You joined ${joined.class_name}! Your teacher can now see your STORYVERSE activity in this class.`);
    await loadStudentClasses();
  } catch (error) { notify(error.message || 'Could not join that class.', 'error'); }
  finally { setBusy(button, false); }
}

async function loadStudentClasses() {
  const list = $('#studentClassList');
  list.innerHTML = '<p class="empty-state loading">Loading your classes…</p>';
  const { data: memberships, error } = await supabase.from('class_members').select('class_id,joined_at').eq('student_id', currentUser.id).order('joined_at', { ascending: false });
  if (error) throw error;
  if (!memberships.length) {
    list.innerHTML = '<p class="empty-state">You have not joined a classroom yet. Enter the code from your teacher above.</p>';
    $('#studentClassDetail').hidden = true;
    localStorage.removeItem(ACTIVE_CLASS_KEY);
    return;
  }
  const ids = memberships.map(m => m.class_id);
  const { data: classes, error: classError } = await supabase.from('classrooms').select('id,name,grade_level,created_at').in('id', ids);
  if (classError) throw classError;
  list.innerHTML = (classes || []).map(c => `<button type="button" class="class-card ${selectedStudentClass === c.id ? 'selected' : ''}" data-student-class="${esc(c.id)}"><div class="small-meta"><span>${esc(c.grade_level)}</span><span>JOINED CLASS</span></div><h3>${esc(c.name)}</h3><p>Tap to view assigned stories and your progress.</p></button>`).join('');
  $$('[data-student-class]', list).forEach(btn => btn.addEventListener('click', () => openStudentClass(btn.dataset.studentClass)));
  const savedActive = localStorage.getItem(ACTIVE_CLASS_KEY);
  const nextClass = selectedStudentClass && ids.includes(selectedStudentClass) ? selectedStudentClass : ids.includes(savedActive) ? savedActive : ids[0];
  await openStudentClass(nextClass);
}

async function openStudentClass(classId) {
  selectedStudentClass = classId;
  localStorage.setItem(ACTIVE_CLASS_KEY, classId);
  const detail = $('#studentClassDetail');
  detail.hidden = false;
  detail.innerHTML = '<div class="detail-shell"><p class="empty-state">Loading your assigned stories…</p></div>';
  const { data: rows, error: classError } = await supabase.from('classrooms').select('id,name,grade_level').eq('id', classId).limit(1);
  if (classError) throw classError;
  const classroom = rows?.[0];
  if (!classroom) throw new Error('Classroom not found.');
  const [{ data: assignedRows, error: assignError }, { data: progressRows, error: progressError }, { data: attemptRows, error: attemptError }] = await Promise.all([
    supabase.from('story_assignments').select('story_id').eq('class_id', classId),
    supabase.from('scene_progress').select('story_id,scenes_completed').eq('class_id', classId).eq('student_id', currentUser.id),
    supabase.from('quiz_attempts').select('story_id,score,total,completed_at').eq('class_id', classId).eq('student_id', currentUser.id).order('completed_at', { ascending: false }),
  ]);
  if (assignError) throw assignError;
  if (progressError) throw progressError;
  if (attemptError) throw attemptError;
  const assigned = new Set((assignedRows || []).map(a => a.story_id));
  const stories = storyCatalog.filter(s => assigned.has(s.id));
  const tiles = stories.map(story => {
    const progress = (progressRows || []).find(p => p.story_id === story.id);
    const attempts = (attemptRows || []).filter(a => a.story_id === story.id);
    const latest = attempts[0];
    const sceneCount = Number(progress?.scenes_completed || 0);
    return `<article class="story-assignment"><div class="card-eyebrow">${esc(story.genre || 'STORY')} · ${sceneCount}/3 SCENES</div><h4>${esc(story.title)}</h4><p>${esc(story.description || 'An interactive STORYVERSE adventure.')}</p><p>${latest ? `Latest quiz: ${latest.score}/${latest.total}` : 'No quiz attempt yet'}</p><a href="./index.html?class=${encodeURIComponent(classroom.id)}&story=${encodeURIComponent(story.id)}">OPEN ASSIGNED STORY →</a></article>`;
  }).join('');
  const totalQuiz = (attemptRows || []).length;
  const average = totalQuiz ? Math.round(attemptRows.reduce((sum, a) => sum + a.score / a.total * 100, 0) / totalQuiz) : null;
  detail.innerHTML = `<div class="detail-shell"><div class="detail-head"><div><div class="card-eyebrow">YOUR ACTIVE CLASS</div><h3>${esc(classroom.name)}</h3><p>${esc(classroom.grade_level)} · Your activity is private to you and your teacher.</p></div><div class="code-box">${stories.length} STORY/BOOK(S)</div></div>
    <div class="progress-snapshot" style="display:flex;gap:12px;flex-wrap:wrap;margin:18px 0"><div class="class-card" style="flex:1;min-width:130px;cursor:default"><div class="card-eyebrow">QUIZ AVERAGE</div><h3>${average === null ? '—' : `${average}%`}</h3></div><div class="class-card" style="flex:1;min-width:130px;cursor:default"><div class="card-eyebrow">QUIZ ATTEMPTS</div><h3>${totalQuiz}</h3></div></div>
    <h4 class="section-mini-title">Stories assigned by your teacher</h4><div class="story-assignment-grid">${tiles || '<p class="empty-state">Your teacher has not assigned any stories yet. Check back soon.</p>'}</div></div>`;
  $$('#studentClassList .class-card').forEach(btn => btn.classList.toggle('selected', btn.dataset.studentClass === classId));
}

async function signOut() {
  try { await supabase.auth.signOut(); }
  catch (error) { notify(error.message || 'Could not sign out.', 'error'); }
  localStorage.removeItem(ACTIVE_CLASS_KEY);
  selectedTeacherClass = null;
  selectedStudentClass = null;
}

async function init() {
  if (!supabaseConfigured || !supabase) {
    $('#configNotice').hidden = false;
    $('#authSubmit').disabled = true;
    $('#googleAuthButton').disabled = true;
    $('#loginTab').disabled = true;
    $('#signupTab').disabled = true;
    return;
  }
  try {
    const response = await fetch('./data/stories.json', { cache: 'no-cache' });
    if (response.ok) {
      const data = await response.json();
      storyCatalog = Array.isArray(data.stories) ? data.stories : [];
    }
  } catch (error) { console.warn('Could not read story catalogue:', error); }

  $('#loginTab').addEventListener('click', () => setAuthMode('login'));
  $('#signupTab').addEventListener('click', () => setAuthMode('signup'));
  $('#authForm').addEventListener('submit', handleAuthSubmit);
  $('#googleAuthButton').addEventListener('click', handleGoogleAuth);
  $('#createClassForm').addEventListener('submit', createClass);
  $('#joinClassForm').addEventListener('submit', joinClass);
  $('#signOut').addEventListener('click', signOut);
  $('#classCode').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  setAuthMode('login');

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    try { await applyPendingGoogleRole(session.user); }
    catch (error) { notify(error.message || 'Could not save the Google account type.', 'error'); }
    await renderSignedIn(session.user);
  }
  supabase.auth.onAuthStateChange((_event, sessionNow) => {
    if (sessionNow?.user) {
      // Avoid auth callback async work inside Supabase's auth lock callback.
      setTimeout(async () => {
        try { await applyPendingGoogleRole(sessionNow.user); }
        catch (error) { notify(error.message || 'Could not save the Google account type.', 'error'); }
        await renderSignedIn(sessionNow.user);
      }, 0);
    } else {
      currentUser = null;
      currentProfile = null;
      $('#appPanel').hidden = true;
      $('#authPanel').hidden = false;
    }
  });
}

init().catch(error => {
  console.error(error);
  notify(error.message || 'STORYVERSE Classroom could not start.', 'error');
});
