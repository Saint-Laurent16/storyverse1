# STORYVERSE 2.0 — Classroom and Supabase Setup

This upgrade adds teacher/student accounts, private classrooms with join codes, assigned stories, cloud scene progress, scored classroom quizzes, and teacher-entered pre-test/post-test records.

## Before you begin

- Keep the GitHub Pages repository **public** so the free GitHub Pages site can be published.
- Create a Supabase project on the Free plan for the research pilot.
- Use school-approved accounts or research IDs for students. Do not collect unnecessary personal information.
- Ask your research adviser/school to approve the account and student-data workflow before inviting minors.

## A. Create the Supabase project

1. Go to <https://supabase.com/dashboard> and sign in or create an account.
2. Choose **New project**.
3. Select or create an organization.
4. Enter a project name such as `storyverse-classroom`.
5. Create a strong database password and store it somewhere private. It is not the browser API key.
6. Choose a region appropriate for your school and create the project.
7. Wait until the project is ready.

## B. Create the database tables and security rules

If you already ran the STORYVERSE classroom schema successfully in this same Supabase project, do not run a second copy just for the website upload. Use the schema file as a reference and only run a missing setup step if your SQL Editor reports that it has not been applied.

1. Open the new Supabase project.
2. Open **SQL Editor**.
3. Choose **New query**.
4. Open the supplied `supabase-schema.sql` file on your computer and copy all of its contents.
5. Paste the SQL into the Supabase editor and click **Run**.
6. Confirm that the query finishes without an error.

The schema creates the profiles, classrooms, class memberships, assignments, scene progress, quiz attempts, and pre/post assessment tables. It also enables Row Level Security and adds database functions for creating/joining classes, storing a requested account type without granting teacher privileges, validating scene progress, and scoring quizzes. Student scene progress is written through a database function that verifies class membership and story assignment; students do not receive direct write access to the progress table.

### Load the private quiz answer key

If you already ran the matching private answer-key SQL successfully, you do not need to run it again. The supplied script uses `ON CONFLICT` and can also be safely rerun if you need to restore/update the three story keys.

1. In Supabase SQL Editor, start another **New query**.
2. Open the separate `PRIVATE_QUIZ_ANSWER_KEY.sql` file supplied alongside the website ZIP.
3. Copy and run it in Supabase.
4. Keep this file private. **Do not upload `PRIVATE_QUIZ_ANSWER_KEY.sql` to your public GitHub repository or share it with students.**

The public `data/stories.json` contains quiz questions and choices but no correct-answer indexes. The database stores the answer key in a non-exposed schema and scores completed class quizzes server-side. If you edit the quiz question order or correct choices in the Editor Studio, update and rerun the private answer-key SQL in Supabase too; do not publish that answer-key file.

## C. Set the Supabase authentication URLs

In the Supabase project, open **Authentication → URL Configuration**.

Set the **Site URL** to:

`https://saint-laurent16.github.io/storyverse1/`

Add these to **Redirect URLs**:

`https://saint-laurent16.github.io/storyverse1/classroom.html`

`https://saint-laurent16.github.io/storyverse1/**`

If your GitHub username or repository name changes, replace the URL with your actual GitHub Pages address.

In **Authentication → Sign In / Providers → Email**, keep email/password sign-in enabled. Email confirmation is recommended. Supabase's built-in email sender has sending limits; for a school pilot with several accounts, coordinate sign-ups in small batches or configure a trusted SMTP provider if needed.

### Email/password sign-in only

This version uses email and password only. Google sign-in is not required and does not need to be enabled in Supabase.

## D. Copy your public Supabase settings into the website

1. In Supabase, open the project's **Connect** dialog, or **Project Settings → API Keys**.
2. Copy the **Project URL**.
3. Copy the **Publishable key** (it starts with `sb_publishable_`).
4. Open `supabase-client.js` in the website project.
5. Replace the two placeholder strings:

```js
export const SUPABASE_URL = 'PASTE_YOUR_SUPABASE_PROJECT_URL_HERE';
export const SUPABASE_PUBLISHABLE_KEY = 'PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE';
```

Use your actual Project URL and Publishable key. Save the file.

**Never put a Supabase Secret key or `service_role` key in `supabase-client.js`, HTML, JavaScript, or GitHub.** The browser uses the publishable key; Row Level Security controls access.

## E. Upload the upgrade to the existing GitHub repository

Open your repository: <https://github.com/Saint-Laurent16/storyverse1>

Upload the contents of this project folder to the repository root. Replace the old versions of `index.html`, `app.js`, `styles.css`, `README.md`, and `data/stories.json` when GitHub asks. Add these new files:

```text
classroom.html
classroom.css
classroom.js
supabase-client.js
supabase-schema.sql
CLASSROOM_SETUP.md
```

Make sure the `data` folder remains a folder at the repository root and that it contains `stories.json`.

Do **not** upload `PRIVATE_QUIZ_ANSWER_KEY.sql` to the public repository. Keep it on the project administrator's device after running it in Supabase.

Commit the upload to the `main` branch. GitHub Pages should redeploy automatically. Your existing Pages setting remains `main` / `/(root)`.

## F. Approve the first teacher account

For safety, a new account that selects **Teacher** is created as a pending teacher request, not an active teacher. This prevents an unknown person from registering as a teacher and creating a class for minors before the project owner verifies them.

1. Open the published site and choose **Classroom Login**.
2. Choose **Create account** and register using the teacher's email. Select **Teacher**.
3. Confirm the email, then log in.
4. In Supabase, open **SQL Editor → New query**.
5. Replace `teacher@example.com` in the following SQL with the exact teacher email and run it:

```sql
update public.profiles p
set role = 'teacher'
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('teacher@example.com')
  and p.requested_role = 'teacher';
```

6. Ask the teacher to log out and log back in (or refresh after signing in again). The Teacher Dashboard should now appear.

Only the project owner/admin should run this promotion query. Do not give students access to Supabase SQL Editor or project settings.

## G. Teacher workflow

1. Teacher logs in at `https://saint-laurent16.github.io/storyverse1/classroom.html`.
2. Click **Create a classroom**.
3. Enter a class name and grade level. A unique 10-character join code is generated.
4. Assign one or more storybooks using the checkboxes.
5. Share the code privately with the students in that class.
6. Review the class dashboard to see enrolled students, scenes completed, average story quiz scores, and pre/post assessment percentages.
7. Enter approved pre-test and post-test percentages for each learner and press **Save**. The dashboard displays the percentage-point change.

A teacher can create and manage multiple classrooms. Each classroom has its own join code, student list, assignments, and records.

## H. Student workflow

1. Student opens the Classroom Login page and chooses **Create account**.
2. Student selects **Student**, uses a research ID/nickname as their display name, and registers with an approved email account.
3. Student confirms the email and logs in.
4. Student types the teacher's join code and taps **Join class**. Joining is immediate; no approval request is needed.
5. Student opens an assigned story from the classroom dashboard.
6. The app records completed scenes and submits the quiz to Supabase when all questions are answered.
7. The teacher can see the learner's progress in that classroom. Students cannot see other students' individual records.

## I. Testing checklist before the study

- [ ] Register a test teacher using email/password and approve that teacher with the SQL query above.
- [ ] Register a separate test student.
- [ ] Create a classroom as the teacher and copy its code.
- [ ] Join that classroom as the student.
- [ ] Assign all three stories.
- [ ] Open an assigned story from the student's classroom dashboard.
- [ ] Complete all three scenes; verify scene progress appears in the teacher dashboard.
- [ ] Complete the five-question quiz; verify the database-scored result appears in the teacher dashboard.
- [ ] Enter test pre/post percentages as the teacher and verify the percentage-point change.
- [ ] Try opening another student's class data while signed in as the student; the database should deny access.
- [ ] Test on the actual phones and browsers that research participants will use.

## Important research and privacy limitations

- **Pre/post scores are teacher-entered** in this version. Use the same approved assessment, same maximum score, and consistent administration conditions for both phases.
- Quiz correctness is calculated by a Supabase database function. Students cannot directly insert or edit quiz scores through the normal browser API permissions. However, the story quiz is still a short formative activity, not a validated standardized reading-comprehension instrument.
- Scene completion indicates button-based progress through the story. It does not prove that the student read every word or listened to the narration.
- The site uses public GitHub Pages for static files and a Supabase project for account/database functions. Do not collect full birth dates, home addresses, or other unnecessary sensitive data.
- The free Supabase plan may pause a project after a week with too little activity. Paused projects can be restored, but this may interrupt a scheduled research session. Check the Supabase dashboard before each scheduled session.
- This project is a technical prototype. Test authentication, email confirmation, camera scanning, 3D performance, and classroom data permissions with test accounts before using real participants.

## Troubleshooting

**The page says Supabase is not configured.** Check that `supabase-client.js` contains the correct Project URL and Publishable key, then commit the file and wait for GitHub Pages to redeploy.

**Email confirmation returns an error.** Check the Site URL and Redirect URLs in Supabase Authentication → URL Configuration. The `classroom.html` URL must be allowed.

**Teacher sees a pending message.** Run the teacher approval SQL in section F using the exact email address, then sign out and sign in again.

**Student cannot join.** Check that they are logged in with a Student account, that the code has ten characters, and that the classroom is active.

**Teacher dashboard has no quiz scores.** Confirm the private answer-key SQL was run, the story is assigned to the class, and the student opened the story through the classroom assignment link rather than from the public story library.

**The website works but the teacher sees no scene progress.** The student must open the story from their assigned classroom link while signed in. Public/demo story opens do not sync to a class.
