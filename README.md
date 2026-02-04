# Ontology Labeler

A comprehensive web application for labeling and aligning ontology properties in text sentences. This tool facilitates the creation of high-quality datasets for relation extraction and ontology alignment tasks.

## Features

### 1. User Authentication & Roles
*   **Secure Login/Signup**: Users can create accounts using a unique username.
*   **Role-Based Access**:
    *   **Standard Users**: Access to labeling interface and personal history.
    *   **Admin**: Exclusive access to the Admin Dashboard for data management and global statistics (Restricted to `admin` username).
*   **Profile Management**: Users can update their passwords and view personal contributions.

### 2. Labeling Interface
The core of the application provides an intuitive interface for annotating sentences:
*   **Span Selection**: Interactive token-based selection for **Subject** and **Object** entities.
*   **Alignment Classification**: classify the relationship between the property and the text using 5 distinct labels:
    *   **p(D, R)**: Full alignment (Property, Domain, and Range match).
    *   **p(D, ?)**: Property and Domain align.
    *   **p(?, R)**: Property and Range align.
    *   **p(?, ?)**: Property expressed, but Domain/Range do not align.
    *   **No alignment**: Irrelevant sentence.
*   **Navigation**:
    *   Sequential navigation (Next/Previous).
    *   **"Next Unlabeled"**: Smart navigation to jump directly to sentences pending annotation.
*   **Validation**: Built-in logic ensures valid span selections for specific label types (e.g., ensuring Subject/Object are selected for `p(D, R)`).

### 3. Dashboard & Property Selection
*   **Property Hub**: Users can browse available ontology properties.
*   **Progress Tracking**: Visual progress bars showing completion status for each property.
*   **Theme Toggle**: Switch between **Light Mode** and **Dark Mode** for comfortable viewing.

### 4. History & Review
*   **Personal History**: Users can review all their past labels.
*   **Advanced Filtering**: Filter history by:
    *   Property Name
    *   Label Type (e.g., only show `p(D, R)`)
    *   Time (Newest/Oldest)
    *   Text Search
*   **Editing**: Ability to revisit and correct previous annotations.

### 5. Admin Dashboard (Admin Only)
A powerful control center for project managers:
*   **Global Statistics**:
    *   Total sentences vs. Labeled sentences.
    *   Coverage percentage.
    *   **Redundancy Metrics**: Track how many sentences have been labeled by multiple users (≥1, ≥2, ≥3, ≥5 times) to ensure inter-annotator agreement.
*   **Top Contributors**: Leaderboard showing the most active users.
*   **Data Export**:
    *   **JSON Export**: Download labeled data for machine learning pipelines.
    *   **Flexible Filtering**: Export data for a specific property or the entire dataset.
    *   **Quality Control**: Option to export only sentences with a minimum number of labels (e.g., "Only export sentences labeled by at least 2 users").

## Technical Stack
*   **Frontend**: React.js
*   **Backend / Database**: Supabase (PostgreSQL)
*   **Styling**: Custom CSS with Theming support

## How to Run
1.  Install dependencies: `npm install`
2.  Start local server: `npm run dev`
3.  Build for production: `npm run build`
