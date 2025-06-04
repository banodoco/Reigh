# Local Development Setup

This guide provides the essential steps to set up and run this project locally using a SQLite database.

## Prerequisites

- Node.js and npm (or yarn) installed.
- Git installed.

## Setup Instructions

1.  **Clone the Repository:**
    ```sh
    # Replace <YOUR_GIT_URL> with the actual Git URL from GitHub
    git clone https://github.com/peteromallet/reigh
    cd reigh
    ```

2.  **Install Dependencies:**
    ```sh
    npm i
    ```

3.  **Configure Environment for Local SQLite:**
    *   Create a file named `.env.local` in the root of your project.
    *   Add the following line to it:
        ```env
        APP_ENV=local
        ```
    This configures the application to use a local SQLite database (defaulting to `./local.db`).

4.  **Set Up and Seed the Local SQLite Database:**
    Run the following command in your terminal:
    ```sh
    npm run db:seed:sqlite
    ```
    This command will:
    *   Create the `./local.db` file if it doesn't exist.
    *   Create all necessary tables based on the schema defined in `db/migrations-sqlite/0000_manual_initial_schema.sql`.
    *   Populate the database with initial seed data.
    *   You should see a confirmation message like `[Seed] Database seeding completed successfully.` in your terminal.

5.  **Start the Development Servers:**

    You'll need to run two separate commands in two different terminal sessions:

    *   **Frontend Development Server (Vite):**
        ```sh
        npm run dev
        ```
        Your application frontend should now be running (typically at `http://localhost:2222/`).

    *   **Backend API Server (Express.js):**
        ```sh
        npm run start:api
        ```
        This will start your backend server. Check your terminal output for messages indicating the server is running (e.g., listening on a specific port, typically different from the frontend).

    The frontend server will connect to the local SQLite database via the backend API server. Check your frontend terminal output for a message similar to `[DB] Connecting to SQLite at ./local.db via Drizzle...` (this message might appear when the backend server starts, or when the frontend first tries to communicate with it).

---

Your local development environment is now ready. You can access the application in your browser and begin working.
