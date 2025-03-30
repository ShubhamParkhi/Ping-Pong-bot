const { ethers } = require('ethers');
const fs = require('fs');
require('dotenv').config();

const CONTRACT = process.env.CONTRACT;
const PROVIDER = process.env.PROVIDER;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const STATE_FILE = 'state.json';
const POLLING_INTERVAL = 30000;

const processedTxHashes = new Set();

const CONTRACT_ABI = [
  "event Ping()",
  "event Pong(bytes32 txHash)",
  "function pong(bytes32 _txHash) external"
];

const provider = new ethers.JsonRpcProvider(PROVIDER);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT, CONTRACT_ABI, wallet);

function saveState(lastProcessedBlock) {
  const state = {
    lastProcessedBlock,
    processedTxHashes: Array.from(processedTxHashes)
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  console.log(`State updated: Block ${lastProcessedBlock}`);
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      console.log(`Loading state from block ${state.lastProcessedBlock}`);
      if (state.processedTxHashes) {
        state.processedTxHashes.forEach(hash => processedTxHashes.add(hash));
      }
      return state.lastProcessedBlock;
    }
  } catch (error) {
    console.error(`Failed to load state: ${error.message}`);
  }
  
  return null;
}

async function initializePingPongBot() {
  try {
    let fromBlock = loadState();
    if (!fromBlock) {
      const currentBlock = await provider.getBlockNumber();
      fromBlock = currentBlock;
      console.log(`Initializing from block ${fromBlock}`);
      saveState(fromBlock);
    }

    console.log(`PingPong Bot initialized`);
    console.log(`Contract: ${CONTRACT}`);
    console.log(`Bot address: ${wallet.address}`);

    fromBlock = await syncMissedEvents(fromBlock);
    configureEventListener();
    
    setInterval(async () => {
      fromBlock = await syncMissedEvents(fromBlock);
    }, POLLING_INTERVAL);
    
  } catch (error) {
    console.error(`Error in initializePingPongBot: ${error.message}`);
    setTimeout(initializePingPongBot, 10000);
  }
}

async function syncMissedEvents(fromBlock) {
  try {
    const currentBlock = await provider.getBlockNumber();
    console.log(`Scanning blocks ${fromBlock} to ${currentBlock} for missed events`);
    
    const filter = contract.filters.Ping();
    const events = await contract.queryFilter(filter, fromBlock, currentBlock);
    
    for (const event of events) {
      try {
        await processEvent(event);
      } catch (error) {
        console.error(`Error handling event at block ${event.blockNumber}: ${error.message}`);
      }
    }
    
    if (currentBlock > fromBlock) {
      fromBlock = currentBlock;
      saveState(currentBlock);
    }
  } catch (error) {
    console.error(`Error in syncMissedEvents: ${error.message}`);
  }
  return fromBlock;
}

function configureEventListener() {
  contract.on("Ping", async (event) => {
    try {
      await processEvent(event.log);
    } catch (error) {
      console.error(`Error handling event: ${error.message}`);
    }
  });
}

async function processEvent(event) {
  const txHash = event.transactionHash;
  
  if (processedTxHashes.has(txHash)) {
    return;
  }
  
  processedTxHashes.add(txHash);
  
  const bytes32TxHash = ethers.hexlify(ethers.zeroPadValue(txHash, 32));
  
  console.log(`Sending Pong response with hash: ${bytes32TxHash}`);
  
  try {
    const tx = await contract.pong(bytes32TxHash, {
      gasLimit: 100000
    });
    
    console.log(`Pong transaction sent: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`Pong confirmed in block ${receipt.blockNumber}`);
    saveState(event.blockNumber);
  } catch (error) {
    processedTxHashes.delete(txHash);
    console.error(`Event processing failed at block ${event.blockNumber}: ${error.message}`);
    throw error;
  }
}

process.on('SIGINT', () => {
  console.log('Bot shutting down...');
  process.exit(0);
});

initializePingPongBot();
