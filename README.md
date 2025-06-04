# Local Development Setup

This guide provides the essential steps to set up and run this project locally using a SQLite database.

## Prerequisites

- Node.js and npm (or yarn) installed.
  - It is recommended to use Node.js version 18 or newer.
  - <details>
    <summary>If you need to install/manage Node.js versions (click to expand)</summary>

    We recommend using [Node Version Manager (nvm)](https://github.com/nvm-sh/nvm) to install and manage Node.js versions.

    1.  **Install nvm:**
        Open your terminal and run the following command:
        ```sh
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
        ```
        Or, if you prefer `wget`:
        ```sh
        wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
        ```
    2.  **Activate nvm:**
        After the installation, you might need to close and reopen your terminal. Alternatively, you can source your shell's configuration file immediately. For example, if you use `zsh` (common on macOS):
        ```sh
        source ~/.zshrc
        ```
        Or for `bash`:
        ```sh
        source ~/.bashrc
        ```
        The nvm installation script usually provides specific instructions for your shell if needed.
    3.  **Install Node.js:**
        Once nvm is active, install the recommended Node.js version (e.g., v18):
        ```sh
        nvm install 18
        nvm use 18
        nvm alias default 18
        ```
    4.  **Verify installation:**
        Check your Node.js and npm versions:
        ```sh
        node -v
        npm -v
        ```
        You should see versions like `v18.x.x` and `10.x.x` (or newer compatible versions).

    </details>
- Git installed.

## Setup Instructions

1.  **Clone the Repository:**
    ```sh    
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

6.  **Running on Hosted Platforms (e.g., Runpod):**

    When deploying or running the development environment on a hosted platform like Runpod, your frontend and backend will likely be accessible via different public URLs/ports. The Vite development server needs to be told where to proxy API requests.

    *   **Backend API (`npm run start:api`):** This server runs on an internal port (default `3001`). The platform (e.g., Runpod) will map a public IP and port to this internal port. For example, `http://<your-public-ip>:<public-backend-port>` might map to internal port `3001`.
    *   **Frontend Dev Server (`npm run dev`):** This server runs on an internal port (default `2222`). The platform will also map a public IP and port to this. You'll access your app via `http://<your-public-ip>:<public-frontend-port>`.

    To ensure the frontend can reach the backend API:
    *   Identify the full public URL of your **backend API server**.
    *   When starting the Vite frontend development server, set the `VITE_API_TARGET_URL` environment variable to this public backend URL.

    Example:
    If your Runpod backend API is accessible at `http://213.173.108.33:13296`, you would start your Vite dev server like this:
    ```sh
    VITE_API_TARGET_URL=http://213.173.108.33:13296 npm run dev
    ```
    The Vite dev server will then proxy any requests made from the frontend to `/api/...` to `http://213.173.108.33:13296/api/...`.

    For local development, you do not need to set `VITE_API_TARGET_URL`, as it will default to `http://localhost:3001` (the typical local backend address).

---

Your local development environment is now ready. You can access the application in your browser and begin working.
