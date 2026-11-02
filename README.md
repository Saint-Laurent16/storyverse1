# STORYVERSE — Augmented Reality Storybooks + Classroom Edition

A free-to-host, mobile-first educational storybook platform for Grade 7–9 English reading practice, with teacher/student accounts and private classrooms powered by Supabase.

## Student features

- Three stories: **Anansi’s Web**, **The Lost Forest**, and **The Ocean’s Secret**.
- Three manually navigated scenes per story.
- Three.js 3D environments and interactive characters, with WebXR AR when supported and a 3D fallback.
- Unique QR codes per story, camera QR scanner, and QR image upload fallback.
- Read-aloud narration, pronunciation support, and synthesized ambient background tones.
- Comprehension quizzes. In class-linked mode, the score is calculated in Supabase; the public story JSON does not contain the answer key.
- Local progress display for personal browsing, plus cloud sync of assigned-story scene progress and quiz attempts.

## Teacher and classroom features

- Email/password registration and login for both teacher and student account types.
- Teacher registration requires project-owner approval before class creation is enabled.
- Teachers can create multiple private classrooms, each with a unique 10-character code.
- Students can instantly join a classroom with its code.
- Teachers can assign one or more stories per classroom.
- Teacher dashboard lists students, scene completion, average quiz scores, and teacher-entered pre-test/post-test percentages.
- Student progress is private to that student and the teachers who own their joined classroom(s), enforced using Supabase Row Level Security.

## Files

```text
storyverse_work/
├── index.html
├── styles.css
├── app.js
├── classroom.html
├── classroom.css
├── classroom.js
├── supabase-client.js
├── supabase-schema.sql
├── CLASSROOM_SETUP.md
├── README.md
└── data/
    └── stories.json
```

## Setup

Follow **CLASSROOM_SETUP.md** for the complete Supabase setup, teacher approval, GitHub Pages upload, and student/teacher workflow.

At a glance:

1. Run `supabase-schema.sql` in Supabase SQL Editor.
2. Download the separate `PRIVATE_QUIZ_ANSWER_KEY.sql` file and run it in Supabase SQL Editor, then keep it private. Do not commit it to the public repository.
3. Add your Supabase Project URL and Publishable key to `supabase-client.js`. Never use a Secret or `service_role` key in browser code.
4. Upload the website files to the root of your GitHub Pages repository, excluding `PRIVATE_QUIZ_ANSWER_KEY.sql`.
5. Set the Supabase Auth Site URL and Redirect URLs to your published GitHub Pages address.
6. Register a teacher and student test account. Promote the teacher account using the SQL in `CLASSROOM_SETUP.md`.

## Research notes

- Teacher-entered pre/post scores should come from the same approved assessment and scoring scale.
- Story quiz scores are automatically calculated by a Supabase database function, but the quizzes are formative activities, not validated standardized assessments.
- Scene progress records button-based navigation; it cannot verify attention, reading quality, or narration playback.
- Obtain school/research-adviser approval and required consent before creating student accounts or collecting research data. Prefer study IDs/nicknames and avoid unnecessary personal information.
- Supabase Free projects can pause after a week of low activity. Check project status before scheduled classroom sessions.

## Dependencies

- Three.js 0.187.0 via jsDelivr CDN.
- html5-qrcode 2.3.8 via unpkg CDN.
- QRCode.js 1.0.0 via cdnjs CDN.
- Supabase JavaScript client v2 via jsDelivr CDN.

The browser requires internet access to load these libraries and connect to Supabase. Camera access requires HTTPS (GitHub Pages provides HTTPS).


## Sign-in methods

The Classroom page uses email/password sign-in only. No Google OAuth setup is needed. Teacher access remains pending until a project administrator approves it.
