import { ChainId } from '@pancakeswap/chains'
import { useTranslation } from '@pancakeswap/localization'
import {
  ArrowUpIcon,
  AtomBox,
  Box,
  Button,
  Flex,
  Heading,
  LinkExternal,
  LinkIcon,
  ModalBody,
  ModalCloseButton,
  ModalContainer,
  ModalHeader,
  ModalTitle,
  ModalV2,
  Spinner,
  Text,
  useMatchBreakpoints,
  useToast,
} from '@pancakeswap/uikit'
import { formatNumber, getBalanceNumber } from '@pancakeswap/utils/formatBalance'
import BigNumber from 'bignumber.js'
import { ToastDescriptionWithTx } from 'components/Toast'
import { pancakeVeSenderV2ABI } from 'config/abi/pancakeVeSenderV2ABI'
import addresses from 'config/constants/contracts'
import useActiveWeb3React from 'hooks/useActiveWeb3React'
import useCatchTxError from 'hooks/useCatchTxError'
import { usePancakeVeSenderV2Contract } from 'hooks/useContract'
import { useVeCakeBalance } from 'hooks/useTokenBalance'
import { useCallback, useState } from 'react'
import { styled } from 'styled-components'
import { publicClient } from 'utils/wagmi'
import { ArbitrumIcon, BinanceIcon, EthereumIcon } from './ChainLogos'
// import { getCrossChainMessage } from '@pancakeswap/ifos'

export async function getEstimateGasFees({ eid, dstGas }): Promise<{ nativeFee: bigint; lzTokenFee: bigint }> {
  console.log(addresses.pancakeVeSenderV2[ChainId.BSC], 'address?????')
  const [estimateGasFeesData] = await publicClient({ chainId: ChainId.BSC }).multicall({
    contracts: [
      {
        address: addresses.pancakeVeSenderV2[ChainId.BSC],
        functionName: 'getEstimateGasFees',
        abi: pancakeVeSenderV2ABI,
        args: [eid, dstGas] as const,
      } as const,
    ],
  })
  if (!estimateGasFeesData.result) return { nativeFee: 0n, lzTokenFee: 0n }

  const [estimateGasFees] = [estimateGasFeesData.result]
  return estimateGasFees
}

const StyledModalHeader = styled(ModalHeader)`
  padding: 0;
  margin-bottom: 16px;
`

const LayerZeroEIdMap = {
  [ChainId.ETHEREUM]: 30101,
  [ChainId.BSC]: 30102,
  [ChainId.ARBITRUM_ONE]: 30110,
}

const LayerZeroFee = {
  [ChainId.ETHEREUM]: 114670586267181697n,
  [ChainId.ARBITRUM_ONE]: 262309998201766n,
}

const ChainNameMap = {
  [ChainId.ETHEREUM]: 'Ethereum',
  [ChainId.ARBITRUM_ONE]: 'Arbitrum',
}

const chainDstGasMap = {
  [ChainId.ETHEREUM]: 650000n,
  [ChainId.ARBITRUM_ONE]: 850000n,
}

const ChainLogoMap = {
  [ChainId.BSC]: <BinanceIcon />,
  [ChainId.ETHEREUM]: <EthereumIcon width={16} />,
  [ChainId.ARBITRUM_ONE]: <ArbitrumIcon width={20} height={20} />,
}

const StyleUl = styled.ul`
  list-style-type: '\2022';
  list-style-position: outside;
  margin-left: 16px;
  margin-top: 20px;
  li {
    padding-left: 5px;
    color: ${({ theme }) => theme.colors.textSubtle};
    font-size: 12px;
  }
`

const LogoWrapper = styled.div`
  display: flex;
  width: 32px;
  height: 32px;
  justify-content: center;
  align-items: center;
  background: #280d5f;
  border-radius: 8px;
`

export const VeCakeChainBox = styled.div`
  display: flex;
  padding: 16px;
  justify-content: space-between;
  align-items: center;
  align-self: stretch;
  border-radius: 16px;
  cursor: pointer;
  background: ${({ theme }) => theme.colors.gradientCardHeader};
  border: 2px solid transparent;
  transition: border-color 0.25s ease-in-out;
  &.is-selected {
    border-color: ${({ theme }) => theme.colors.success};
  }
`

export const CrossChainVeCakeModal: React.FC<{
  modalTitle?: string
  onDismiss?: () => void
  isOpen?: boolean
  setIsOpen?: (isOpen: boolean) => void
}> = ({ onDismiss, modalTitle, isOpen }) => {
  const { isDesktop } = useMatchBreakpoints()
  const { account, chain } = useActiveWeb3React()
  const { t } = useTranslation()
  const veCakeSenderV2Contract = usePancakeVeSenderV2Contract(ChainId.BSC)
  const { fetchWithCatchTxError, loading: pendingTx } = useCatchTxError()
  const { toastSuccess } = useToast()
  const [selectChainId, setSelectChainId] = useState<ChainId | undefined>(undefined)
  const [txByChain, setTxByChain] = useState<Record<number, string>>({
    [ChainId.ARBITRUM_ONE]: '',
    [ChainId.ETHEREUM]: '',
  })
  const [modalState, setModalState] = useState<'list' | 'ready' | 'submitted' | 'done'>('list')
  const { balance: veCakeOnBsc } = useVeCakeBalance(ChainId.BSC)

  const syncVeCake = useCallback(
    async (chainId: ChainId) => {
      if (!account || !veCakeSenderV2Contract || !chainId) return
      setModalState('ready')
      const syncFee = BigInt(new BigNumber(LayerZeroFee[chainId].toString()).times(1.1).toNumber().toFixed(0))

      try {
        const feeData = await getEstimateGasFees({ eid: LayerZeroEIdMap[chainId], dstGas: chainDstGasMap[chainId] })
        console.log(feeData, 'feeData')
      } catch (e) {
        console.log(e, 'feeData error')
      }

      const receipt = await fetchWithCatchTxError(async () =>
        veCakeSenderV2Contract.write.sendSyncMsg(
          [LayerZeroEIdMap[chainId], account, true, true, chainDstGasMap[chainId]],
          {
            account,
            chain,
            value: syncFee, // payable BNB for cross chain fee
          },
        ),
      )
      if (receipt?.status) {
        toastSuccess(
          `${t('Syncing VeCake')}!`,
          <ToastDescriptionWithTx txHash={receipt.transactionHash}>
            {t('Your VeCake is Syncing to')} {ChainNameMap[chainId]}
          </ToastDescriptionWithTx>,
        )
        setTxByChain((prev) => ({ ...prev, [chainId]: receipt.transactionHash }))
        setModalState('submitted')
      }
    },
    [account, veCakeSenderV2Contract, fetchWithCatchTxError, chain, toastSuccess, t],
  )
  return (
    <ModalV2
      isOpen={isOpen}
      onDismiss={() => {
        onDismiss?.()
        setModalState('list')
      }}
      closeOnOverlayClick
    >
      <ModalContainer style={{ minWidth: '375px', padding: isDesktop ? '24px' : '24px 24px 0 24px' }}>
        {modalState === 'list' ? (
          <AtomBox justifyContent="space-between" p="24px" maxWidth="420px" height="100%" style={{ margin: '-24px' }}>
            <StyledModalHeader headerBorderColor="transparent">
              <ModalTitle>
                <Flex flexDirection="column">
                  <Heading scale="md">{modalTitle ?? t('veCAKE Sync')}</Heading>
                  <Text fontSize={14} color="textSubtle">
                    {t('Sync your veCAKE and Pancake Profile across all supported networks.')}
                  </Text>
                </Flex>
              </ModalTitle>
              <ModalCloseButton onDismiss={onDismiss} />
            </StyledModalHeader>
            <ModalBody minHeight={450}>
              <Text fontSize={12} color="textSubtle" textTransform="uppercase" fontWeight={600} mb="8px">
                {t('My veCAKE')}
              </Text>
              <BinanceChainCard />
              <Text fontSize={12} color="textSubtle" textTransform="uppercase" fontWeight={600} mt="24px" mb="8px">
                {t('Network to Sync')}
              </Text>
              <Flex flexDirection="column" style={{ gap: 12 }}>
                <OtherChainsCard
                  chainName={t('Arbitrum')}
                  chainId={ChainId.ARBITRUM_ONE}
                  onSelected={setSelectChainId}
                  Icon={<ArbitrumIcon width={20} height={20} />}
                  isSelected={selectChainId === ChainId.ARBITRUM_ONE}
                  veCakeOnBsc={veCakeOnBsc}
                  hash={txByChain[ChainId.ARBITRUM_ONE]}
                />
                <OtherChainsCard
                  chainName={t('Ethereum')}
                  chainId={ChainId.ETHEREUM}
                  onSelected={setSelectChainId}
                  Icon={<EthereumIcon width={16} />}
                  isSelected={selectChainId === ChainId.ETHEREUM}
                  veCakeOnBsc={veCakeOnBsc}
                  hash={txByChain[ChainId.ETHEREUM]}
                />
              </Flex>
              <InfoBox />
              <Flex style={{ gap: 10 }} mt="20px">
                <Button
                  width="50%"
                  disabled={!selectChainId}
                  onClick={() => {
                    if (selectChainId) syncVeCake(selectChainId)
                  }}
                >
                  {t('Sync')}
                </Button>
                <Button variant="secondary" width="50%" onClick={onDismiss}>
                  {t('Close')}
                </Button>
              </Flex>
            </ModalBody>
          </AtomBox>
        ) : (
          <>
            <StyledModalHeader headerBorderColor="transparent">
              <ModalTitle />
              <ModalCloseButton onDismiss={() => setModalState('list')} />
            </StyledModalHeader>
            {modalState === 'ready' && selectChainId && <ReadyToSyncView chainId={selectChainId} />}
            {modalState === 'submitted' && selectChainId && (
              <SubmittedView chainId={selectChainId} hash={txByChain[selectChainId] ?? ''} />
            )}
          </>
        )}
      </ModalContainer>
    </ModalV2>
  )
}

const InfoBox = () => {
  const { t } = useTranslation()
  return (
    <StyleUl>
      <li>{t('Once synced, your veCAKE on the selected network will stay in sync with BNB Chain.')}</li>
      <li>{t('You will need to sync again after extending or adding more CAKE to your CAKE Staking position.')}</li>
      <li>{t('Your Pancake Profile will be synced along with your veCAKE.')}</li>
    </StyleUl>
  )
}

const BinanceChainCard = () => {
  const { t } = useTranslation()
  const { balance } = useVeCakeBalance(ChainId.BSC)
  return (
    <VeCakeChainBox>
      <Flex alignItems="center" style={{ gap: 5 }}>
        <LogoWrapper>
          <BinanceIcon />
        </LogoWrapper>
        <Text>{t('BNB')}</Text>
      </Flex>
      <Text>{formatNumber(getBalanceNumber(balance))}</Text>
      <img srcSet="/images/cake-staking/token-vecake.png 2x" alt="cross-chain-vecake" />
    </VeCakeChainBox>
  )
}

const OtherChainsCard: React.FC<{
  chainName: string
  chainId: ChainId
  Icon: React.ReactElement
  onSelected: (chainId: ChainId) => void
  isSelected: boolean
  veCakeOnBsc: BigNumber
  hash?: string
}> = ({ chainName, chainId, Icon, onSelected, isSelected, veCakeOnBsc, hash }) => {
  const { balance } = useVeCakeBalance(chainId)
  const { t } = useTranslation()
  const isSynced = balance.isGreaterThanOrEqualTo(veCakeOnBsc)
  return (
    <VeCakeChainBox onClick={() => onSelected(chainId)} className={isSelected ? 'is-selected' : undefined}>
      <Flex alignItems="center" style={{ gap: 5 }}>
        <LogoWrapper> {Icon}</LogoWrapper>
        <Text>{chainName}</Text>
      </Flex>
      <Flex flexDirection="column">
        <Text fontSize="14px" color="textSubtle">
          {t('Profile')}
        </Text>
        {hash && !isSynced ? (
          <LinkExternal external href={`https://layerzeroscan.com/tx/${hash}`}>
            {t('In Progress')}
          </LinkExternal>
        ) : (
          <Text fontSize="16px">{isSynced ? t('Synced') : t('To be Synced')}</Text>
        )}
      </Flex>
      <Flex flexDirection="column">
        <Text fontSize="14px" color="textSubtle">
          {t('veCAKE')}
        </Text>
        <Text fontSize="16px" textAlign="right">
          {formatNumber(getBalanceNumber(balance))}
        </Text>
      </Flex>
    </VeCakeChainBox>
  )
}

const ReadyToSyncView: React.FC<{ chainId: ChainId }> = ({ chainId }) => {
  const { t } = useTranslation()
  return (
    <Flex flexDirection="column" alignItems="center" justifyContent="center" style={{ gap: 10 }}>
      <Spinner size={120} />
      <Text fontSize={16} fontWeight={600} mt="16px">
        {t('VeCake Sync')}
      </Text>
      <Text fontSize={12} mt="12px">
        {t('From BSC to')} {ChainNameMap[chainId]}
      </Text>
      <Flex justifyContent="flex-end" alignItems="flex-end" style={{ gap: 5 }} mt="12px">
        <img srcSet="/images/cake-staking/token-vecake.png 2x" alt="cross-chain-vecake" />
        <LogoWrapper> {ChainLogoMap[ChainId.BSC]}</LogoWrapper>
        <Box>
          <LinkIcon color="success" />
        </Box>
        <LogoWrapper> {ChainLogoMap[chainId]}</LogoWrapper>
      </Flex>
      <Text mt="30px" color="textSubtle">
        {t('Proceed in your wallet')}
      </Text>
      <Text mt="16px" color="textSubtle">
        {t('Est. time: 2-5 minutes')}
      </Text>
    </Flex>
  )
}

const SubmittedView: React.FC<{ chainId: ChainId; hash: string }> = ({ chainId, hash }) => {
  const { t } = useTranslation()
  return (
    <Flex flexDirection="column" alignItems="center" justifyContent="center" style={{ gap: 10 }}>
      <ArrowUpIcon color="success" width="90px" />
      <Text fontSize={16} fontWeight={600} mt="16px">
        {t('VeCake Sync Submitted')}
      </Text>
      <Text fontSize={12} mt="12px">
        {t('From BSC to')} {ChainNameMap[chainId]}
      </Text>
      <Flex justifyContent="flex-end" alignItems="flex-end" style={{ gap: 5 }} mt="12px">
        <img srcSet="/images/cake-staking/token-vecake.png 2x" alt="cross-chain-vecake" />
        <LogoWrapper> {ChainLogoMap[ChainId.BSC]}</LogoWrapper>
        <Box>
          <LinkIcon color="success" />
        </Box>
        <LogoWrapper> {ChainLogoMap[chainId]}</LogoWrapper>
      </Flex>
      <Text mt="30px" color="textSubtle">
        {t('Proceed in your wallet')}
      </Text>
      <Text mt="16px" color="textSubtle">
        {t('Est. time: 2-5 minutes')}
      </Text>
      <LinkExternal external href={`https://layerzeroscan.com/tx/${hash}`}>
        {t('Track in LayerZero Explorer')}
      </LinkExternal>
    </Flex>
  )
}
