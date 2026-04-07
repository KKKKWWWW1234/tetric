# **Project Blueprint: 이기킹의 비행기 (Enhanced)**

## **Project Overview**
This project is an enhanced version of the 1945 Air Force-style shooting game, featuring personalized branding, Google Authentication via Firebase, and a persistent scoreboard.

## **Project Details & Features**
- **Core Gameplay:**
  - **Player Control:** Keyboard and Touch movement.
  - **Scoring:** Killing enemies grants 100 points. Score is displayed at the top.
  - **Difficulty:** Enemy spawn rate increases as score rises.

- **Design & Aesthetics:**
  - **Title:** "이기킹의 비행기" (Igiking's Airplane).
  - **Subtitle:** "하늘의 지배자, 전설의 비행이 시작됩니다".
  - **Background:** Custom background image (`photo/2.png`) for the start screen.
  - **UI:** Modern, semi-transparent overlays with glowing effects.

- **Technical Architecture:**
  - **Authentication:** Firebase Auth (Google Provider).
  - **Database:** Firebase Firestore (for high scores).
  - **Fallback:** Mock Auth system implemented for immediate playability.

## **Implementation Progress**

### **Step 1: Core Setup & Repository Connection**
- [x] Connect the project to GitHub.
- [x] Initialize project structure.

### **Step 2: Enhanced UI & Branding**
- [x] Update title and subtitle in `index.html`.
- [x] Add `photo` directory and background image styling.
- [x] Implement the Scoreboard UI.

### **Step 3: Firebase & Auth Integration**
- [x] Add Firebase SDKs.
- [x] Implement Google Login logic in `main.js`.
- [x] Create Mock Auth fallback for development.

### **Step 4: Gameplay Refinement**
- [x] Increase score reward for enemy destruction (100 pts).
- [x] Update UI real-time with score.

## **Verification Plan**
- [x] **Title/UI Test:** Verify "이기킹의 비행기" is displayed.
- [x] **Auth Test:** Login button triggers auth flow (or Mock flow).
- [x] **Scoring Test:** Score increases correctly during gameplay.
- [x] **Responsive Test:** Game works on mobile and desktop.
