# Ping Pong Bot

A simple Ethereum bot that listens for Ping events and responds with Pong transactions.

## Prerequisites

- Node.js
- npm or yarn
- An Ethereum wallet with some ETH for transactions

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

## Configuration

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Configure the following environment variables in `.env`:
- `PRIVATE_KEY`: Your wallet's private key
- `RPC_URL`: Ethereum network RPC URL
- `CONTRACT`: Smart contract address to monitor

## Usage

Start the bot:
```bash
npm start
```

The bot will:
- Initialize from the current block
- Listen for Ping events
- Automatically respond with Pong transactions
- Save state to continue from the last processed block on restart

## Features

- Event monitoring and processing
- Automatic transaction handling
- State persistence
- Error handling and auto-recovery
