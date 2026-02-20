import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "0x0000000000000000000000000000000000000000000000000000000000000001";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.19",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
        },
      },
      {
        version: "0.8.24",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
        },
      },
    ],
  },
  paths: {
    // All compilable contracts live in contracts/ to avoid Hardhat
    // accidentally crawling node_modules on Windows (HH1006).
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hederaTestnet: {
      url:     "https://testnet.hashio.io/api",
      chainId: 296,
      accounts: [DEPLOYER_KEY],
    },
    adiTestnet: {
      url:     process.env.ADI_RPC || "https://rpc.ab.testnet.adifoundation.ai",
      chainId: 99999,
      accounts: [DEPLOYER_KEY],
    },
  },
};

export default config;
