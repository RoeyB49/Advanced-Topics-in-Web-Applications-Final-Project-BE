# Advanced Topics in Web Applications – Final Project (BE)

Backend service for our final project.  
This repository contains the server-side API, business logic, authentication flow, and database integration used by the application.

## What we built

- A backend API for the project’s core features
- User authentication and authorization
- Data persistence and database modeling
- Input validation and error handling
- Structured project architecture for scalability and maintenance

## Tech stack

- Node.js
- Express
- [Your DB here]
- [Any additional tools/libraries you used]

## Project status

Core backend functionality is implemented and working.  
Additional polishing, documentation improvements, and UI/screenshots will be added later.

## Run locally

1. Clone the repo
2. Install dependencies
3. Create `.env` file
4. Start the server

Example:

```bash
npm install
npm run dev
```

## Notes

- Environment variables are required (`.env`)

## Deployment (Colman Ubuntu Server)

This project can be deployed on your provided server (`node01.cs.colman.ac.il`) using:

- Backend with `pm2` on port `4000`
- Frontend static files via `nginx`
- Nginx reverse proxy for `/api`, `/api-docs`, and `/uploads`

### Important prerequisite

SSH (`port 22`) is available only via SSL VPN according to your IT guide.
If SSH is refused, connect VPN first.

### 1. Server folders

Run on server:

```bash
mkdir -p ~/apps
mkdir -p /var/www/animon-fe
```

### 2. Backend setup (server)

```bash
cd ~/apps
git clone <YOUR_BE_REPO_URL> animon-be
cd animon-be
cp deploy/.env.production.example .env
nano .env
chmod +x deploy/deploy_be.sh deploy/setup_nginx.sh
./deploy/deploy_be.sh
```

### 3. Frontend setup (server)

Clone frontend on server under `~/apps/animon-fe` and deploy static build to `/var/www/animon-fe/dist`.
Use the frontend deployment script from FE repo branch `chore/fe-deploy-colman-ubuntu`.

### 4. Nginx setup (server)

```bash
cd ~/apps/animon-be
./deploy/setup_nginx.sh
```

### 5. Verify

- `http://node01.cs.colman.ac.il` -> frontend
- `http://node01.cs.colman.ac.il/api` -> backend routes
- `http://node01.cs.colman.ac.il/api-docs` -> Swagger

### Deployment files in this repo

- `deploy/deploy_be.sh`
- `deploy/ecosystem.config.cjs`
- `deploy/setup_nginx.sh`
- `deploy/nginx_animon.conf`
- `deploy/.env.production.example`
