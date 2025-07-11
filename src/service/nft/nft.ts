import { Container, Service } from 'typedi'
import { ApiBalanceRequest } from '../../api/api.dto'
import { TatumConnector } from '../../connector/tatum.connector'
import { AddressBalanceFilters } from '../../dto'
import { CONFIG, ErrorUtils, ResponseDto } from '../../util'
import { Ipfs } from '../ipfs'
import { TatumConfig } from '../tatum'
import {
  CheckTokenOwner,
  CreateMultiTokenNftCollection,
  CreateNftCollectionBase,
  CreateNftEvmCollection,
  GetAllNftTransactionsByAddress,
  GetAllNftTransactionsQuery,
  GetCollection,
  GetNftMetadata,
  GetTokenOwner,
  MintNftWithMetadata,
  MintNftWithUrl,
  NftAddressBalance,
  NftTokenDetail,
  NftTransaction,
} from './nft.dto'

@Service({
  factory: (data: { id: string }) => {
    return new NftTezos(data.id)
  },
  transient: true,
})
export class NftTezos {
  protected readonly connector: TatumConnector
  protected readonly config: TatumConfig

  constructor(private readonly id: string) {
    this.config = Container.of(this.id).get(CONFIG)
    this.connector = Container.of(this.id).get(TatumConnector)
  }

  /**
   * Create new NFT collection (Tzip12 compatible smart contract). This operation deploys a new smart contract to the blockchain and sets the owner of the collection.
   * You don't need to specify the default minter of the collection, as the owner of the collection is the default minter.
   * You don't have to have any funds on the address, as the smart contract is deployed by Tatum.
   * @param body Body of the request.
   * @returns ResponseDto<{txId: string}> Transaction ID of the deployment transaction. You can get the contract address from the transaction details using rpc.getContractAddress(transactionId) function, once transaction is included in the block.
   */
  async createNftCollection(body: CreateNftCollectionBase): Promise<ResponseDto<{ txId: string }>> {
    return ErrorUtils.tryFail(() =>
      this.connector.post<{ txId: string }>({
        path: `contract/deploy`,
        body: {
          ...body,
          chain: this.config.network,
          contractType: 'nft',
        },
      }),
    )
  }
}

@Service({
  factory: (data: { id: string }) => {
    return new Nft(data.id)
  },
  transient: true,
})
export class Nft {
  private readonly connector: TatumConnector
  private readonly config: TatumConfig
  private readonly ipfs: Ipfs

  constructor(private readonly id: string) {
    this.config = Container.of(this.id).get(CONFIG)
    this.connector = Container.of(this.id).get(TatumConnector)
    this.ipfs = Container.of(this.id).get(Ipfs)
  }

  /**
   * Create new NFT collection (ERC-721 compatible smart contract). This operation deploys new smart contract to the blockchain and sets the owner of the collection.
   * You don't need to specify the default minter of the collection, as the owner of the collection is the default minter.
   * You don't have to have any funds on the address, as the smart contract is deployed by Tatum.
   * @param body Body of the request.
   * @returns ResponseDto<{txId: string}> Transaction ID of the deployment transaction. You can get the contract address from the transaction details using rpc.getContractAddress(transactionId) function, once transaction is included in the block.
   */
  async createNftCollection(body: CreateNftEvmCollection): Promise<ResponseDto<{ txId: string }>> {
    return ErrorUtils.tryFail(() =>
      this.connector.post<{ txId: string }>({
        path: `contract/deploy`,
        body: {
          ...body,
          chain: this.config.network,
          contractType: 'nft',
        },
      }),
    )
  }

  /**
   * Create new MultiToken NFT collection (ERC-1155 compatible smart contract). This operation deploys new smart contract to the blockchain and sets the owner of the collection.
   * You don't need to specify the default minter of the collection, as the owner of the collection is the default minter.
   * You don't have to have any funds on the address, as the smart contract is deployed by Tatum.
   * @param body Body of the request.
   * @returns ResponseDto<{txId: string}> Transaction ID of the deployment transaction. You can get the contract address from the transaction details using rpc.getContractAddress(transactionId) function, once transaction is included in the block.
   */
  async createMultiTokenNftCollection(
    body: CreateMultiTokenNftCollection,
  ): Promise<ResponseDto<{ txId: string }>> {
    return ErrorUtils.tryFail(() =>
      this.connector.post<{ txId: string }>({
        path: `contract/deploy`,
        body: {
          ...body,
          chain: this.config.network,
          contractType: 'multitoken',
        },
      }),
    )
  }

  /**
   * Mint new NFT (using ERC-721 compatible smart contract). This operation mints nft using smart contract on blockchain.
   * You don't need to specify the default minter of the collection, as the owner of the collection is the default minter.
   * You don't have to have any funds on the address, as the nft is minted by Tatum.
   * @param body Body of the request.
   * @returns ResponseDto<{txId: string}> Transaction ID of the mint transaction. {
   */
  async mintNft(body: MintNftWithUrl): Promise<ResponseDto<{ txId: string }>> {
    return ErrorUtils.tryFail(() =>
      this.connector.post<{ txId: string }>({
        path: `contract/erc721/mint`,
        body: {
          ...body,
          chain: this.config.network,
        },
      }),
    )
  }

  /**
   * Mint new NFT (using ERC-721 compatible smart contract).
   * This operation uploads file to IPFS, prepares and uploads metadata to IPFS and mints nft using prepared metadata's IPFS url.
   * You don't need to specify the default minter of the collection, as the owner of the collection is the default minter.
   * You don't have to have any funds on the address, as the nft is minted by Tatum.
   * @param body Body of the request.
   * @returns ResponseDto<{txId: string}> Transaction ID of the mint transaction. {
   */
  async mintNftWithMetadata(body: MintNftWithMetadata): Promise<ResponseDto<{ txId: string }>> {
    const imageUpload = await this.ipfs.uploadFile({ file: body.file })
    if (imageUpload.error) {
      return ErrorUtils.toErrorResponse(imageUpload.error)
    }

    const metadataUpload = await this.ipfs.uploadFile({
      file: Buffer.from(
        JSON.stringify({
          ...body.metadata,
          image: `ipfs://${imageUpload.data.ipfsHash}`,
        }),
      ),
    })

    if (metadataUpload.error) {
      return ErrorUtils.toErrorResponse(metadataUpload.error)
    }

    return ErrorUtils.tryFail(() =>
      this.connector.post<{ txId: string }>({
        path: `contract/erc721/mint`,
        body: {
          ...body,
          url: `ipfs://${metadataUpload.data.ipfsHash}`,
          chain: this.config.network,
        },
      }),
    )
  }

  /**
   * Get balance of NFT for given address.
   * You can get balance of multiple addresses in one call.
   */
  async getBalance({
    page = 0,
    pageSize = 50,
    addresses,
  }: AddressBalanceFilters): Promise<ResponseDto<NftAddressBalance[]>> {
    const chain = this.config.network
    return ErrorUtils.tryFail(() =>
      this.connector
        .get<{ result: NftAddressBalance[] }, ApiBalanceRequest>({
          path: `data/wallet/portfolio`,
          params: {
            pageSize,
            offset: page,
            chain,
            tokenTypes: 'nft,multitoken',
            addresses: addresses.join(','),
          },
        })
        .then((r) => r.result),
    )
  }

  /**
   * Get all transactions for given NFT.
   * @param nftTransactionsDetails  You can get multiple NFT transactions in one call.
   * @param page
   * @param pageSize
   */
  async getAllNftTransactions({
    page = 0,
    pageSize = 50,
    tokenId,
    tokenAddress,
    transactionType,
    fromBlock,
    toBlock,
  }: GetAllNftTransactionsQuery): Promise<ResponseDto<NftTransaction[]>> {
    const chain = this.config.network
    return ErrorUtils.tryFail(() =>
      this.connector
        .get<{ result: NftTransaction[] }>({
          path: `data/transaction/history`,
          params: {
            pageSize,
            offset: page,
            chain,
            tokenTypes: 'nft,multitoken',
            transactionSubtype: transactionType,
            tokenAddress,
            tokenId,
            blockFrom: fromBlock,
            blockTo: toBlock,
          },
        })
        .then((r) => r.result),
    )
  }

  /**
   * Get all transactions for given NFT.
   * @param nftTransactionsDetails  You can get multiple NFT transactions in one call.
   * @param page
   * @param pageSize
   */
  async getAllNftTransactionsByAddress({
    page = 0,
    pageSize = 50,
    addresses,
    tokenId,
    tokenAddress,
    transactionType,
    fromBlock,
    toBlock,
  }: GetAllNftTransactionsByAddress): Promise<ResponseDto<NftTransaction[]>> {
    const chain = this.config.network
    return ErrorUtils.tryFail(() =>
      this.connector
        .get<{ result: NftTransaction[] }>({
          path: `data/transaction/history`,
          params: {
            pageSize,
            offset: page,
            chain,
            addresses: addresses.join(','),
            tokenTypes: 'nft,multitoken',
            transactionSubtype: transactionType,
            tokenAddress,
            tokenId,
            blockFrom: fromBlock,
            blockTo: toBlock,
          },
        })
        .then((r) => r.result),
    )
  }

  /**
   * Get metadata of NFT.
   */
  async getNftMetadata({
    tokenAddress,
    tokenId,
  }: GetNftMetadata): Promise<ResponseDto<NftTokenDetail | null>> {
    const chain = this.config.network
    return ErrorUtils.tryFail(async () => {
      const response = await this.connector.get<Array<NftTokenDetail>>({
        path: `data/metadata`,
        params: {
          chain,
          tokenAddress,
          tokenIds: tokenId,
        },
      })
      if (response?.length) {
        return response[0]
      }
      return null
    })
  }

  /**
   * Get owner of a specific NFT.
   */
  async getNftOwner({
    tokenAddress,
    tokenId,
    pageSize,
    page,
  }: GetTokenOwner): Promise<ResponseDto<string[]>> {
    const chain = this.config.network
    return ErrorUtils.tryFail(() =>
      this.connector.get<Array<string>>({
        path: `data/owners`,
        params: {
          chain,
          tokenAddress,
          tokenId,
          pageSize,
          offset: page,
        },
      }),
    )
  }

  /**
   * Check if address is owner of a specific NFT.
   */
  async checkNftOwner({ tokenAddress, tokenId, owner }: CheckTokenOwner): Promise<boolean> {
    const chain = this.config.network
    return this.connector.get<boolean>({
      path: `data/owners/address`,
      params: {
        chain,
        tokenAddress,
        address: owner,
        tokenId,
      },
    })
  }

  /**
   * Get all NFTs in collection.
   */
  async getNftsInCollection({
    collectionAddress,
    pageSize,
    excludeMetadata = false,
    page,
  }: GetCollection): Promise<ResponseDto<NftTokenDetail[]>> {
    const chain = this.config.network
    return ErrorUtils.tryFail(() =>
      this.connector.get<Array<NftTokenDetail>>({
        path: `data/collections`,
        params: {
          pageSize,
          offset: page,
          chain,
          collectionAddresses: collectionAddress,
          excludeMetadata,
        },
      }),
    )
  }
}
