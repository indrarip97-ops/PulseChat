# PulseChat

PulseChat is a simple browser-based messaging website demo.

## Features

- Sign up with a display name, email, and password
- Each account gets its own automatically generated unique username
- Log in to an existing account
- Search registered users by email
- Send, receive, accept, and decline friend requests
- Send direct messages between connected friends
- Delete messages from a conversation
- Automatically remove messages after 30 days
- Data is saved in a shared local server file when you run `server.js`

## How to run

1. Run `node server.js`.
2. Open `http://127.0.0.1:4173` in any browser.
3. Create an account or log in.

## Notes

- Run the app through `server.js` if you want Chrome, Edge, and other browsers to share the same accounts.
- Opening `index.html` directly still works as a browser-only fallback, but each browser will have separate accounts.
- Shared app data is saved in `pulsechat-data.json` on this computer.
- The app removes expired messages whenever it loads or saves chat data.
- If you want, this can be upgraded next into a real full-stack app with a database and live multi-user messaging.
