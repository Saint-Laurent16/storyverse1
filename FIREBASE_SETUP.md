# STORYVERSE Classroom — Firebase setup

This update keeps the original STORYVERSE homepage, stories, Three.js scenes, QR scanner, audio, and quizzes. It adds name-and-password accounts, teacher/student roles, private class codes, and synchronized reading/quiz progress.

## Important account design note

The interface asks only for a name and password. Firebase's built-in Email/Password provider requires an email-shaped sign-in identifier, so the code deterministically creates a hidden identifier like `sv-<hash>@storyverse.invalid` from the normalized name. Students never see or enter this. It is not a real mailbox and cannot receive password-reset email. Names must be unique in this STORYVERSE Firebase project. Passwords are handled by Firebase Authentication; the app does not store plaintext passwords in Firestore.

**Account recovery:** because no email or phone number is collected, there is no self-service password reset. A forgotten password currently means the user needs a new account/name or a project maintainer must implement an approved recovery process. Keep this in mind before research deployment.

## 1. Create the free Firebase project

1. Visit https://console.firebase.google.com/ and sign in with a Google account.
2. Choose **Add project** and name it `STORYVERSE` (or similar). Google Analytics is optional; it is not needed for this website.
3. In the project overview, click the **Web** icon (`</>`), register an app named `STORYVERSE Web`, and copy the Firebase configuration object.
4. Open `firebase-config.js` in this folder. Replace the placeholder values for `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, and `appId` with the exact values from Firebase. Do not add quotation marks around the entire object; keep the JavaScript structure.

Firebase web setup guide: https://firebase.google.com/docs/web/setup

## 2. Turn on name/password authentication

1. In Firebase Console, open **Build → Authentication**.
2. Click **Get started** if prompted.
3. Open **Sign-in method** (or **Sign-in providers**).
4. Enable **Email/Password**. The UI still asks students for name + password only; the email-shaped identifier is internal.
5. In Authentication **Settings → Authorized domains**, add `saint-laurent16.github.io` if it is not already listed. Add any other hostname you use to host the website.

Official guide: https://firebase.google.com/docs/auth/web/password-auth

## 3. Create Firestore and publish the security rules

1. Open **Build → Firestore Database** and click **Create database**.
2. Choose a location suitable for your school/participants. Firebase does not let you change the database location after creation.
3. Choose **Start in production mode**.
4. Open the **Rules** tab. Replace the starter rules with the full contents of `firestore.rules` from this folder.
5. Click **Publish**. Do not use open/test rules for student data.

Firestore rules guide: https://firebase.google.com/docs/firestore/security/get-started

The supplied rules enforce: users can access their own account/profile and progress; teachers can list only their own classrooms; students can join a class by its code; a teacher can see only the members and progress inside their own class; students can write only their own progress.

## 4. Upload the upgraded site to GitHub

Replace/add these files in the root of your existing repository `Saint-Laurent16/storyverse1`:

- `index.html`
- `app.js`
- `styles.css`
- `data/stories.json` (keep your existing story content)
- `firebase-config.js` (with your project's values)
- `firestore.rules` (keep a copy for reference; rules are published in Firebase Console)
- `README.md` and `FIREBASE_SETUP.md`

Commit the changes to `main`. GitHub Pages will redeploy the website.

## 5. Test before students use it

1. Visit https://saint-laurent16.github.io/storyverse1/ and refresh.
2. Create a **teacher** account using a unique name and a password of at least 8 characters.
3. Create a classroom and copy the generated 8-character code.
4. Open the site in a private/incognito browser or a second device. Create a **student** account using a different unique name.
5. Enter the classroom code and join.
6. Complete a scene and a story quiz. Return to the teacher account and refresh the classroom dashboard. Check that the student's scenes and latest quiz score appear.
7. Test that a second teacher cannot see the first teacher's class unless they own it.

## Roles and privacy

- Both teachers and students can register without administrator approval, as requested. Anyone can select the teacher role. Therefore, teacher registration is open rather than verified by a school administrator.
- Classrooms are not publicly listed. A student needs the private code to join. Anyone who receives a class code can use it, so teachers should share codes only with the intended students.
- The student display name is shown to the teacher of each classroom they join. For Grade 7–9 participants, consider using a study ID or school-approved display name instead of a full legal name, and obtain the required school/parental consent.
- Do not publish student names, class codes, or quiz results publicly. The repository can remain public because the Firebase web config is not a server secret; Firestore Security Rules are the protection boundary. Never put a service-account key or Firebase Admin SDK secret in this repository.
- The teacher dashboard shows joined students, scene completion, completed stories, and each student's latest quiz score. It reads progress saved to the student's account and mirrors it into each classroom they join.

## Free-plan note

GitHub Pages can host this static site for free from a public repository. Firebase offers no-cost quotas on its Spark plan, including a Firestore free quota (currently 1 GiB stored data, 50,000 document reads/day, 20,000 writes/day, and 20,000 deletes/day for the first eligible database). Quotas and plan terms can change; monitor Firebase usage in the console. See https://firebase.google.com/docs/firestore/pricing and https://firebase.google.com/docs/projects/billing/firebase-pricing-plans.

The website has no paid API requirement. If Firebase usage exceeds its free quota, service limits apply; upgrading billing is optional and should not be done unless your project/school approves it.
