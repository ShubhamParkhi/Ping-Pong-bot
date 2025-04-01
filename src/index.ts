import { ethers } from 'ethers';
import * as fs from 'fs';
import 'dotenv/config';

interface State {
  lastProcessedBlock: number;
  processedTxHashes: string[];
}

interface ContractEvent extends ethers.Log {
  transactionHash: string;
  blockNumber: number;
}

const CONTRACT = process.env.CONTRACT as string;
const PROVIDER = process.env.PROVIDER as string;
const PRIVATE_KEY = process.env.PRIVATE_KEY as string;
const STATE_FILE = 'state.json';
const POLLING_INTERVAL = 30000;

const processedTxHashes = new Set<string>();

const CONTRACT_ABI = [
  "event Ping()",
  "event Pong(bytes32 txHash)",
  "function pong(bytes32 _txHash) external"
];

const provider = new ethers.JsonRpcProvider(PROVIDER);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT, CONTRACT_ABI, wallet);

function saveState(lastProcessedBlock: number): void {
  const state: State = {
    lastProcessedBlock,
    processedTxHashes: Array.from(processedTxHashes)
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  console.log(`State updated: Block ${lastProcessedBlock}`);
}

function loadState(): number | null {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const state: State = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      console.log(`Loading state from block ${state.lastProcessedBlock}`);
      if (state.processedTxHashes) {
        state.processedTxHashes.forEach(hash => processedTxHashes.add(hash));
      }
      return state.lastProcessedBlock;
    }
  } catch (error) {
    console.error(`Failed to load state: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  return null;
}

async function initializePingPongBot(): Promise<void> {
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
      if (fromBlock !== null) {
        fromBlock = await syncMissedEvents(fromBlock);
      }
    }, POLLING_INTERVAL);
    
  } catch (error) {
    console.error(`Error in initializePingPongBot: ${error instanceof Error ? error.message : String(error)}`);
    setTimeout(initializePingPongBot, 10000);
  }
}

async function syncMissedEvents(fromBlock: number): Promise<number> {
  try {
    const currentBlock = await provider.getBlockNumber();
    console.log(`Scanning blocks ${fromBlock} to ${currentBlock} for missed events`);
    
    const filter = contract.filters.Ping();
    const events = await contract.queryFilter(filter, fromBlock, currentBlock);
    
    for (const event of events) {
      try {
        await processEvent(event);
      } catch (error) {
        console.error(`Error handling event at block ${event.blockNumber}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    if (currentBlock > fromBlock) {
      fromBlock = currentBlock;
      saveState(currentBlock);
    }
  } catch (error) {
    console.error(`Error in syncMissedEvents: ${error instanceof Error ? error.message : String(error)}`);
  }
  return fromBlock;
}

function configureEventListener(): void {
  contract.on("Ping", async (event: { log: ContractEvent }) => {
    try {
      await processEvent(event.log);
    } catch (error) {
      console.error(`Error handling event: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

let currentNonce: number | null = null;

async function getNextNonce(): Promise<number> {
  if (currentNonce === null) {
    currentNonce = await wallet.getNonce();
  }
  return currentNonce++;
}

async function processEvent(event: ContractEvent): Promise<void> {
  const txHash = event.transactionHash;
  
  if (processedTxHashes.has(txHash)) {
    return;
  }
  
  processedTxHashes.add(txHash);
  
  const bytes32TxHash = ethers.hexlify(ethers.zeroPadValue(txHash, 32));
  
  console.log(`Sending Pong response with hash: ${bytes32TxHash}`);
  
  try {
    const nonce = await getNextNonce();
    const feeData = await provider.getFeeData();
    const maxFeePerGas = feeData.maxFeePerGas ? feeData.maxFeePerGas * BigInt(12) / BigInt(10) : undefined;
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ? feeData.maxPriorityFeePerGas * BigInt(12) / BigInt(10) : undefined;

    const tx = await contract.pong(bytes32TxHash, {
      nonce,
      maxFeePerGas,
      maxPriorityFeePerGas,
      type: 2
    });
    
    console.log(`Pong transaction sent: ${tx.hash} with nonce ${nonce}`);
    
    const receipt = await tx.wait();
    console.log(`Pong confirmed in block ${receipt?.blockNumber}`);
    saveState(event.blockNumber);
  } catch (error) {
    processedTxHashes.delete(txHash);
    console.error(`Event processing failed at block ${event.blockNumber}: ${error instanceof Error ? error.message : String(error)}`);
    currentNonce = null;
    throw error;
  }
}

process.on('SIGINT', () => {
  console.log('Bot shutting down...');
  process.exit(0);
});

initializePingPongBot();