# Smart Energy Meter — Render Backend

This repository contains the Node.js backend for a blockchain-integrated smart energy metering system. The server provides API endpoints that enable ESP32-based smart meters and client applications to submit, retrieve, and verify energy consumption records through a backend deployed on Render.

The project integrates **Node.js, Express, and the Solana blockchain** to support the recording and retrieval of selected energy meter data, with the goal of improving data traceability and integrity in a multi-user energy monitoring environment.

## Key Features

- **REST API:** Provides HTTP endpoints for communication between smart meter hardware, mobile applications, and the backend.
- **ESP32 Integration:** Supports sending energy meter readings from connected embedded devices.
- **Solana Blockchain Integration:** Interacts with the Solana network to submit and retrieve supported meter records.
- **Energy Record Retrieval:** Enables clients to request previously recorded meter information through the API.
- **Transaction Verification:** Supports checking blockchain transaction results and record status.
- **Cloud Deployment:** Designed for deployment on Render.
- **Environment-Based Configuration:** Uses environment variables to manage configuration and sensitive credentials.

## Technologies

- **Runtime:** Node.js
- **Backend Framework:** Express.js
- **Blockchain:** Solana
- **Blockchain SDK:** `@solana/web3.js`
- **Configuration:** dotenv
- **Hosting:** Render
- **Communication:** REST API over HTTP/HTTPS

## System Architecture

1. **ESP32 Smart Meter:** Collects energy consumption measurements from the connected energy monitoring hardware.
2. **Backend API:** Receives meter data and processes client requests.
3. **Solana Network:** Records supported data through the configured blockchain integration.
4. **Render Hosting:** Runs the backend service and exposes API endpoints over the internet.
5. **Client Applications:** Android or other authorised clients can request meter records and transaction information.

## Configuration

Configure the required environment variables in your local environment or Render dashboard. Keep private keys, API credentials, and other secrets out of source control.

Create a `.env` file locally if required by your implementation, and ensure it is excluded through `.gitignore`.

## Deployment

1. Push the backend source code to GitHub.
2. Create a Web Service on Render and connect the repository.
3. Configure the required environment variables.
4. Set the appropriate build and start commands for the project.
5. Deploy the service and test the available API endpoints.

## Security Considerations

- Never commit wallet private keys or secret credentials.
- Validate incoming meter data before processing.
- Restrict sensitive endpoints and apply appropriate authentication.
- Verify blockchain transaction status rather than relying solely on an API success response.
- Remember that blockchain records can provide tamper evidence, but they do not independently prove that the original sensor measurements were accurate.

## Project Objective

To provide a cloud-accessible backend connecting embedded smart meters and client applications with Solana blockchain services for traceable energy data management.

## Project Status

This repository is part of an ongoing smart metering prototype. Available functionality depends on the implemented API endpoints, configured Solana program, and deployment settings.

## Research Focus

Embedded Systems | Internet of Things | Node.js | REST APIs | Solana Blockchain | Smart Metering | Energy Data Integrity
