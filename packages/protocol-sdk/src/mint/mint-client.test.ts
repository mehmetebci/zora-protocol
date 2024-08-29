import { describe, expect, vi } from "vitest";
import { Address, erc20Abi, parseAbi, parseEther, zeroAddress } from "viem";
import { zora, zoraSepolia } from "viem/chains";
import {
  zoraCreator1155ImplABI,
  zoraTimedSaleStrategyAddress,
} from "@zoralabs/protocol-deployments";
import { forkUrls, makeAnvilTest, writeContractWithRetries } from "src/anvil";
import { createCollectorClient, createCreatorClient } from "src/sdk";
import { getAllowListEntry } from "src/allow-list/allow-list-client";
import {
  demoContractMetadataURI,
  demoTokenMetadataURI,
} from "src/create/1155-create-helper.test";
import { SubgraphMintGetter } from "./subgraph-mint-getter";
import { new1155ContractVersion } from "src/create/contract-setup";
import { SALE_END_FOREVER } from "src/create/minter-defaults";
import { ISubgraphQuerier } from "src/apis/subgraph-querier";
import { TokenQueryResult } from "./subgraph-queries";

const erc721ABI = parseAbi([
  "function balanceOf(address owner) public view returns (uint256)",
] as const);

describe("mint-helper", () => {
  makeAnvilTest({
    forkBlockNumber: 16028671,
    forkUrl: forkUrls.zoraMainnet,
    anvilChainId: zora.id,
  })(
    "mints a new 1155 token",
    async ({ viemClients }) => {
      const { testClient, walletClient, publicClient } = viemClients;
      const creatorAccount = (await walletClient.getAddresses())[0]!;
      await testClient.setBalance({
        address: creatorAccount,
        value: parseEther("2000"),
      });
      const targetContract: Address =
        "0xa2fea3537915dc6c7c7a97a82d1236041e6feb2e";
      const targetTokenId = 1n;
      const collectorClient = createCollectorClient({
        chainId: zora.id,
        publicClient,
      });

      const { token: mintable, prepareMint } = await collectorClient.getToken({
        tokenContract: targetContract,
        mintType: "1155",
        tokenId: targetTokenId,
      });

      mintable.maxSupply;
      mintable.totalMinted;
      mintable.tokenURI;
      mintable;

      const { parameters, costs } = prepareMint({
        minterAccount: creatorAccount,
        quantityToMint: 1,
      });

      expect(costs.totalCostEth).toBe(1n * parseEther("0.000777"));

      const oldBalance = await publicClient.readContract({
        abi: zoraCreator1155ImplABI,
        address: targetContract,
        functionName: "balanceOf",
        args: [creatorAccount, targetTokenId],
      });

      const simulationResult = await publicClient.simulateContract(parameters);

      const hash = await walletClient.writeContract(simulationResult.request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const newBalance = await publicClient.readContract({
        abi: zoraCreator1155ImplABI,
        address: targetContract,
        functionName: "balanceOf",
        args: [creatorAccount, targetTokenId],
      });
      expect(receipt).to.not.be.null;
      expect(oldBalance).to.be.equal(0n);
      expect(newBalance).to.be.equal(1n);
    },
    12 * 1000,
  );

  makeAnvilTest({
    forkUrl: forkUrls.zoraMainnet,
    forkBlockNumber: 6133407,
    anvilChainId: zora.id,
  })(
    "mints a new 721 token",
    async ({ viemClients }) => {
      const { testClient, walletClient, publicClient } = viemClients;
      const creatorAccount = (await walletClient.getAddresses())[0]!;
      await testClient.setBalance({
        address: creatorAccount,
        value: parseEther("2000"),
      });

      const targetContract: Address =
        "0x7aae7e67515A2CbB8585C707Ca6db37BDd3EA839";
      const collectorClient = createCollectorClient({
        chainId: zora.id,
        publicClient,
      });

      const { prepareMint } = await collectorClient.getToken({
        tokenContract: targetContract,
        mintType: "721",
      });

      const quantityToMint = 3n;

      const { parameters, costs } = prepareMint({
        minterAccount: creatorAccount,
        mintRecipient: creatorAccount,
        quantityToMint,
      });

      expect(costs.totalPurchaseCost).toBe(quantityToMint * parseEther(".08"));
      expect(costs.totalCostEth).toBe(
        quantityToMint * (parseEther("0.08") + parseEther("0.000777")),
      );

      const oldBalance = await publicClient.readContract({
        abi: erc721ABI,
        address: targetContract,
        functionName: "balanceOf",
        args: [creatorAccount],
      });

      const simulated = await publicClient.simulateContract(parameters);

      const hash = await walletClient.writeContract(simulated.request);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      expect(receipt).not.to.be.null;

      const newBalance = await publicClient.readContract({
        abi: erc721ABI,
        address: targetContract,
        functionName: "balanceOf",
        args: [creatorAccount],
      });

      expect(oldBalance).to.be.equal(0n);
      expect(newBalance).to.be.equal(quantityToMint);
    },
    12 * 1000,
  );

  makeAnvilTest({
    forkUrl: forkUrls.zoraMainnet,
    forkBlockNumber: 14484183,
    anvilChainId: zora.id,
  })(
    "mints an 1155 token with an ERC20 token",
    async ({ viemClients }) => {
      const { testClient, walletClient, publicClient, chain } = viemClients;

      const targetContract: Address =
        "0x689bc305456c38656856d12469aed282fbd89fe0";
      const targetTokenId = 16n;

      const minter = createCollectorClient({ chainId: chain.id, publicClient });

      const mockCollector = "0xb6b701878a1f80197dF2c209D0BDd292EA73164D";
      await testClient.impersonateAccount({
        address: mockCollector,
      });

      const { prepareMint } = await minter.getToken({
        mintType: "1155",
        tokenContract: targetContract,
        tokenId: targetTokenId,
      });

      const quantityToMint = 1n;

      const { parameters, erc20Approval, costs } = prepareMint({
        minterAccount: mockCollector,
        quantityToMint,
      });

      expect(erc20Approval).toBeDefined();
      expect(costs.totalCostEth).toBe(0n);
      expect(costs.totalPurchaseCost).toBe(
        quantityToMint * 1000000000000000000n,
      );
      expect(costs.totalPurchaseCostCurrency).toBe(
        "0xa6b280b42cb0b7c4a4f789ec6ccc3a7609a1bc39",
      );

      const beforeERC20Balance = await publicClient.readContract({
        abi: erc20Abi,
        address: erc20Approval!.erc20,
        functionName: "balanceOf",
        args: [mockCollector],
      });

      // execute the erc20 approval
      const { request: erc20Request } = await publicClient.simulateContract({
        abi: erc20Abi,
        address: erc20Approval!.erc20,
        functionName: "approve",
        args: [erc20Approval!.approveTo, erc20Approval!.quantity],
        account: mockCollector,
      });

      const approveHash = await walletClient.writeContract(erc20Request);
      await publicClient.waitForTransactionReceipt({
        hash: approveHash,
      });

      const beforeCollector1155Balance = await publicClient.readContract({
        abi: zoraCreator1155ImplABI,
        address: targetContract,
        functionName: "balanceOf",
        args: [mockCollector, targetTokenId],
      });
      expect(beforeCollector1155Balance).to.be.equal(0n);

      // execute the mint
      const simulationResult = await publicClient.simulateContract(parameters);
      const hash = await walletClient.writeContract(simulationResult.request);
      await publicClient.waitForTransactionReceipt({ hash });

      const afterERC20Balance = await publicClient.readContract({
        abi: erc20Abi,
        address: erc20Approval!.erc20,
        functionName: "balanceOf",
        args: [mockCollector],
      });

      expect(beforeERC20Balance - afterERC20Balance).to.be.equal(
        erc20Approval!.quantity,
      );

      const afterCollector1155Balance = await publicClient.readContract({
        abi: zoraCreator1155ImplABI,
        address: targetContract,
        functionName: "balanceOf",
        args: [mockCollector, targetTokenId],
      });
      expect(afterCollector1155Balance).to.be.equal(quantityToMint);
    },
    12 * 1000,
  );

  makeAnvilTest({
    forkUrl: forkUrls.zoraSepolia,
    forkBlockNumber: 10970943,
    anvilChainId: zoraSepolia.id,
  })("can mint allowlist tokens", async ({ viemClients }) => {
    const { publicClient, chain, testClient, walletClient } = viemClients;

    const collectorClient = createCollectorClient({
      chainId: chain.id,
      publicClient,
    });

    const targetContract = "0x440cF6a9f12b2f05Ec4Cee8eE0F317B0eC0c2eCD";

    const tokenId = 1n;

    const allowListUser = "0xf69fEc6d858c77e969509843852178bd24CAd2B6";
    const merkleRoot =
      "4d08ab87f97dda8811b4bb32a16a175db65e4c140797c993679a3d58aaadc791";

    const allowListEntryResult = await getAllowListEntry({
      address: allowListUser,
      merkleRoot,
    });

    const { prepareMint } = await collectorClient.getToken({
      mintType: "1155",
      tokenContract: targetContract,
      tokenId,
    });

    const minter = (await walletClient.getAddresses())[0]!;

    await testClient.setBalance({
      address: minter,
      value: parseEther("10"),
    });

    const quantityToMint = allowListEntryResult.allowListEntry!.maxCanMint;

    const { parameters } = prepareMint({
      minterAccount: minter,
      quantityToMint,
      mintRecipient: allowListUser,
      allowListEntry: allowListEntryResult.allowListEntry,
    });

    const { request } = await publicClient.simulateContract(parameters);
    const hash = await walletClient.writeContract(request);

    await publicClient.waitForTransactionReceipt({ hash });

    const balance = await publicClient.readContract({
      abi: zoraCreator1155ImplABI,
      functionName: "balanceOf",
      address: targetContract,
      args: [allowListUser, tokenId],
    });

    expect(balance).toBe(BigInt(quantityToMint));
  }),
    makeAnvilTest({
      forkUrl: forkUrls.zoraSepolia,
      forkBlockNumber: 10294670,
      anvilChainId: zoraSepolia.id,
    })(
      "gets onchain and premint mintables",
      async ({ viemClients }) => {
        const { publicClient, chain } = viemClients;

        const targetContract: Address =
          "0xa33e4228843092bb0f2fcbb2eb237bcefc1046b3";

        const minter = createCollectorClient({
          chainId: chain.id,
          publicClient,
        });

        const { tokens: mintables, contract } =
          await minter.getTokensOfContract({
            tokenContract: targetContract,
          });

        expect(mintables.length).toBe(4);
        expect(contract).toBeDefined();
      },
      12 * 1000,
    );

  makeAnvilTest({
    forkUrl: forkUrls.zoraMainnet,
    forkBlockNumber: 18145203,
    anvilChainId: zora.id,
  })(
    "can mint a zora timed sale strategy mint",
    async ({ viemClients }) => {
      const { publicClient, chain, walletClient } = viemClients;

      const creator = (await walletClient.getAddresses())[0]!;

      const creatorClient = createCreatorClient({
        chainId: chain.id,
        publicClient,
      });

      const { parameters, contractAddress, newTokenId } =
        await creatorClient.create1155({
          account: creator,
          contract: {
            name: "Test Timed Sale",
            uri: demoContractMetadataURI,
            defaultAdmin: creator,
          },
          token: {
            tokenMetadataURI: demoTokenMetadataURI,
          },
        });

      const { request: createRequest } =
        await publicClient.simulateContract(parameters);
      await writeContractWithRetries(createRequest, walletClient, publicClient);

      const zoraCreateToken: TokenQueryResult = {
        contract: {
          address: contractAddress,
          contractVersion: new1155ContractVersion(chain.id),
          // not used:
          mintFeePerQuantity: "0",
          name: "",
          contractURI: "",
          salesStrategies: [],
        },
        creator: creator,
        maxSupply: "1000",
        tokenStandard: "ERC1155",
        totalMinted: "0",
        uri: "",
        tokenId: newTokenId.toString(),
        salesStrategies: [
          {
            type: "ZORA_TIMED",
            zoraTimedMinter: {
              address:
                zoraTimedSaleStrategyAddress[
                  chain.id as keyof typeof zoraTimedSaleStrategyAddress
                ],
              mintFee: "111000000000000",
              saleEnd: SALE_END_FOREVER.toString(),
              saleStart: "0",
              erc20Z: {
                // not needed
                id: zeroAddress,
                // note needed
                pool: zeroAddress,
              },
              secondaryActivated: false,
            },
          },
        ],
      };

      const mockQuery = vi.fn<ISubgraphQuerier["query"]>().mockResolvedValue({
        zoraCreateToken,
      });

      const mintGetter = new SubgraphMintGetter(chain.id);
      mintGetter.subgraphQuerier.query = mockQuery;

      const collectorClient = createCollectorClient({
        chainId: chain.id,
        publicClient,
        mintGetter,
      });

      const collector = (await walletClient.getAddresses())[1]!;

      const { prepareMint } = await collectorClient.getToken({
        mintType: "1155",
        tokenContract: contractAddress,
        tokenId: newTokenId,
      });

      const quantityToMint = 10n;

      const { parameters: mintParameters, costs } = prepareMint({
        minterAccount: collector,
        quantityToMint,
      });

      expect(costs.totalCostEth).toBe(quantityToMint * parseEther("0.000111"));

      const { request: mintRequest } =
        await publicClient.simulateContract(mintParameters);
      const mintHash = await walletClient.writeContract(mintRequest);
      const mintReceipt = await publicClient.waitForTransactionReceipt({
        hash: mintHash,
      });
      expect(mintReceipt.status).toBe("success");

      const balance = await publicClient.readContract({
        abi: zoraCreator1155ImplABI,
        address: contractAddress,
        functionName: "balanceOf",
        args: [collector, newTokenId],
      });

      expect(balance).toBe(quantityToMint);
    },
    20_000,
  );
});
