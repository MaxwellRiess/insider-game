# Digital Insider - Walkthrough

## How to Run
1.  **Server**:
    ```bash
    cd server
    npm run dev
    ```
    Server runs on `http://localhost:3001`.

2.  **Client**:
    ```bash
    cd client
    npm run dev
    ```
    Client runs on `http://localhost:5173`.

## How to Play (Testing Flow)
1.  Open 4 browser tabs/windows to `http://localhost:5173`.
2.  **Player 1 (Host)**:
    - Enter Name: "Host"
    - Click "CREATE ROOM"
    - Note the Room Code (e.g., ABCD).
3.  **Players 2-4**:
    - Enter Name (e.g., "P2", "P3", "P4")
    - Click "JOIN ROOM"
    - Enter the Room Code.
4.  **Lobby**:
    - Host sees all players.
    - Host clicks "START GAME".
5.  **Role Reveal**:
    - All players see their role (Master, Insider, Common).
    - Wait 10 seconds for auto-start.
6.  **Quiz Phase**:
    - Master answers questions using buttons.
    - Players see the log.
    - Master clicks "CORRECT ANSWER FOUND" to end quiz.
7.  **Voting Phase**:
    - Players select a suspect.
    - Click "SUBMIT VOTE".
8.  **Results**:
    - Winner is revealed.
    - Host can click "PLAY AGAIN" to return to Lobby.
