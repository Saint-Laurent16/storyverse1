# STORYVERSE — Augmented Reality Storybooks

A free-to-host, mobile-first educational storybook website for Grade 7–9 reading practice.

## What is included

- Three complete sample stories: **Anansi’s Web**, **The Lost Forest**, and **The Ocean’s Secret**.
- Three manually navigated scenes in every story (the student must tap **NEXT SCENE**).
- A Three.js 3D story world for each scene, with interactive objects, camera drag/orbit, and simple character/environment animations.
- A WebXR immersive-AR launch option on compatible HTTPS devices. When immersive AR is unavailable, the interactive 3D scene remains available.
- Unique QR codes generated for each story. The QR target automatically uses the current website URL plus `?story=<id>`.
- Camera QR scanner and QR-image upload fallback.
- Browser read-aloud narration, pronunciation for vocabulary words, adjustable speech speed, and optional synthesized ambient background tones.
- Five comprehension questions per story, with answer feedback, explanations, and scores.
- A personal progress dashboard saved in the student's current browser/device.
- An Editor Studio to edit the story JSON, save a local preview, and export `stories.json` for publishing.

## Run it on your computer

The site uses browser ES modules and camera features, so do not open `index.html` by double-clicking it.

1. Extract the ZIP.
2. Open a terminal in the `storyverse_site` folder.
3. Run one of these commands:

   **Python:**
   ```bash
   python -m http.server 8000
   ```

   **Node (if installed):**
   ```bash
   npx serve .
   ```

4. Open `http://localhost:8000` in Chrome, Edge, or Firefox.

Localhost is treated as a secure development origin by modern browsers. On a phone, the camera usually will not work when you visit a computer's plain HTTP LAN address; publish the site over HTTPS for phone camera scanning.

## Publish for free with GitHub Pages

GitHub Pages can host a static website from a public repository on the GitHub Free plan.

1. Create or sign in to a GitHub account.
2. Create a **public** repository, for example `storyverse`.
3. Upload the contents of this folder to the repository root (make sure `index.html`, `app.js`, `styles.css`, and the `data` folder are at the root level).
4. In the repository, open **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Select branch **main** and folder **/(root)**, then save.
7. Wait for GitHub Pages to publish the site. Your address will look like `https://YOUR-USERNAME.github.io/storyverse/`.
8. Open the HTTPS link on your phone. Allow camera permission when scanning a QR code.
9. Once the site is live, refresh the page and open each story card's QR panel. Print the codes from the live site so each QR points to the published HTTPS address.

GitHub Pages source instructions: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site

## Edit stories as the project editor

There are two edit paths:

### Easy editor inside the website

1. Open **Editor studio** in the footer.
2. Edit the JSON story content. You can change titles, descriptions, scene text, narration, vocabulary, quiz questions, choices, explanations, and correct answer indexes.
3. Click **Save preview** to see the changes in this browser.
4. Click **Export JSON** to download your edited `stories.json`.
5. Replace the file at `data/stories.json` in your GitHub repository and commit the change to publish the edited stories to all visitors.

Every story must keep exactly three scenes. Quiz answer indexes start at zero: A = `0`, B = `1`, C = `2`, D = `3`.

### Edit the source directly

Edit `data/stories.json` in any text editor, then upload/commit that file to the repository. This is the most reliable way to update the public site.

## Important functionality notes

- **Free hosting:** GitHub Pages is free for public repositories. The site has no paid API, subscription, or database requirement.
- **QR camera:** Browsers require camera access to be permission-based and served in a secure context (HTTPS, or localhost for development). The site also supports choosing an image containing a QR code.
- **AR compatibility:** WebXR immersive AR is not available on every phone/browser. The AR button checks support at runtime. A drag-to-explore Three.js 3D scene is the fallback, so the stories remain usable even without AR.
- **3D asset quality:** The included worlds and characters are procedural Three.js models, not photorealistic, professionally rigged 3D character assets. They demonstrate a working 3D story experience and can be upgraded with custom GLB/GLTF models later.
- **Audio:** Narration uses the speech voices available on the student's device/browser. Background music is a quiet, synthesized ambient sound generated in the browser; no audio files or paid speech API are needed.
- **Student privacy:** The student display name, scene completion, and quiz attempts are stored in that browser's local storage. They are not uploaded, synchronized, or visible to a teacher on another device. Encourage students to use a nickname or research code rather than a full name.
- **Editor privacy:** The editor is a local content tool, not a secure teacher login. Anyone who can open the public website can access its editor and edit a local preview. Only a person with repository write access can publish source changes to the live GitHub Pages site.
- **Research use:** Before using this with research participants, test on the actual student devices and browsers, check school consent/privacy requirements, and pilot the reading materials and comprehension questions with your research adviser.

## Folder contents

```text
storyverse_site/
├── index.html
├── styles.css
├── app.js
├── README.md
└── data/
    └── stories.json
```

## External libraries

- Three.js 0.187.0 (MIT): https://threejs.org/
- html5-qrcode 2.3.8 (Apache-2.0): https://github.com/mebjas/html5-qrcode
- QRCode.js 1.0.0 (MIT): https://github.com/davidshimjs/qrcodejs

The site loads these libraries from public CDNs. An internet connection is required for the first-party code and library downloads.
