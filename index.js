const { ethers } = require("ethers");
const ABI = require("./pool.json");
const config = require("./config");
const database = require("./database");
const {
    RegisterTransaction,
    CheckinTransaction,
    ClaimRewardsTransaction,
    ClaimUplineRewardTransaction
} = require("./models/Transaction");

class BlockchainScanner {
    constructor() {
        this.provider = null;
        this.contract = null;
        this.eventInterfaces = this.initEventInterfaces();
    }

    // 初始化事件接口
    initEventInterfaces() {
        return {
            pointsClaimed: new ethers.Interface([config.EVENT_INTERFACES.POINTS_CLAIMED]),
            transfer: new ethers.Interface([config.EVENT_INTERFACES.TRANSFER])
        };
    }

    // 初始化连接
    async init() {
        try {
            // 连接数据库
            await database.connect();
            
            // 初始化区块链连接
            this.provider = new ethers.JsonRpcProvider(config.RPC_URL);
            this.contract = new ethers.Contract(config.CONTRACT_ADDRESS, ABI, this.provider);

            const latest = await this.provider.getBlockNumber();
            console.log("最新区块高度:", latest);

            await this.startScanning(config.START_BLOCK, latest);
        } catch (error) {
            console.error("初始化失败:", error);
            throw error;
        }
    }

    // 开始扫描
    async startScanning(startBlock, endBlock) {
        console.log(`开始扫描区块 ${startBlock} 到 ${endBlock}`);
        await this.batchScan(startBlock, endBlock);
    }

    // 批量扫描
    async batchScan(start, end, chunk = config.BATCH_SIZE) {
        for (let block = start; block <= end; block += chunk) {
            const toBlock = Math.min(block + chunk - 1, end);
            console.log(`扫描区块范围: ${block} - ${toBlock}`);
            await this.scanBlocks(block, toBlock);
        }
    }

    // 扫描指定区块范围
    async scanBlocks(fromBlock, toBlock) {
        try {
            const logs = await this.provider.getLogs({
                address: config.CONTRACT_ADDRESS,
                fromBlock: fromBlock,
                toBlock: toBlock,
            });

            for (const log of logs) {
                await this.processTransaction(log.transactionHash);
            }
        } catch (error) {
            console.error(`扫描区块 ${fromBlock}-${toBlock} 失败:`, error.message);
        }
    }

    // 处理单个交易
    async processTransaction(txHash) {
        try {
            // 检查交易是否已存在
            if (await this.isTransactionExists(txHash)) {
                console.log(`交易 ${txHash} 已存在，跳过处理`);
                return;
            }

            // 获取交易详情
            const tx = await this.provider.getTransaction(txHash);
            if (!tx || tx.to !== config.CONTRACT_ADDRESS) return;

            // 获取区块和交易收据
            const [block, receipt] = await Promise.all([
                this.provider.getBlock(tx.blockNumber),
                this.provider.getTransactionReceipt(tx.hash)
            ]);

            const parsedTx = this.contract.interface.parseTransaction(tx);
            if (!parsedTx) {
                console.log(`无法解析交易: ${txHash}`);
                return;
            }

            // 处理事件日志并获取事件数据
            const eventData = this.processEventLogs(receipt.logs);

            // 保存交易到数据库
            await this.saveTransactionToDatabase(parsedTx, tx, block, receipt, eventData);

        } catch (error) {
            console.error(`处理交易 ${txHash} 失败:`, error.message);
        }
    }

    // 处理事件日志
    processEventLogs(logs) {
        const pointsClaimedSignature = ethers.id(config.EVENT_SIGNATURES.POINTS_CLAIMED);
        const transferSignature = ethers.id(config.EVENT_SIGNATURES.TRANSFER);
        
        const eventData = {
            pointsClaimed: null,
            transfer: null
        };

        for (const log of logs) {
            try {
                if (log.topics[0] === pointsClaimedSignature) {
                    const parsedLog = this.eventInterfaces.pointsClaimed.parseLog(log);
                    const [user, points, totalClaimedPoints] = parsedLog.args;
                    eventData.pointsClaimed = {
                        user,
                        usdtAmount: ethers.formatUnits(points, 6),
                        tokenAmount: ethers.formatUnits(totalClaimedPoints, 6)
                    };
                    console.log(`提取团队收益: ${user} -> USDT: ${eventData.pointsClaimed.usdtAmount}, AIP: ${eventData.pointsClaimed.tokenAmount}`);
                } else if (log.topics[0] === transferSignature) {
                    const parsedLog = this.eventInterfaces.transfer.parseLog(log);
                    const [from, to, value] = parsedLog.args;
                    eventData.transfer = {
                        from,
                        to,
                        tokenAmount: ethers.formatUnits(value, 6)
                    };
                    console.log(`提取训练收益: ${from} -> TO: ${to}, AIP: ${eventData.transfer.tokenAmount}`);
                }
            } catch (error) {
                // 忽略无法解析的日志
            }
        }
        
        return eventData;
    }

    // 处理交易方法
    processTransactionMethod(parsedTx, tx, date) {
        if (!parsedTx) {
            console.log("未解析到的方法");
            return;
        }

        const baseInfo = {
            method: this.getMethodDisplayName(parsedTx.name),
            blockNumber: tx.blockNumber,
            time: date,
            index: tx.index,
            ethValue: ethers.formatEther(tx.value),
            gasFee: ethers.formatEther(tx.gasPrice * tx.gasLimit),
            hash: tx.hash,
            from: tx.from
        };

        switch (parsedTx.name) {
            case config.CONTRACT_METHODS.REGISTER:
                const [registrant] = parsedTx.args;
                this.logTransactionInfo({ ...baseInfo, referrer: registrant });
                break;
            case config.CONTRACT_METHODS.CHECKIN:
            case config.CONTRACT_METHODS.CLAIM_REWARDS:
            case config.CONTRACT_METHODS.CLAIM_UPLINE_REWARD:
                this.logTransactionInfo(baseInfo);
                break;
            default:
                console.log("未识别的方法:", parsedTx.name);
        }
    }

    // 获取方法显示名称
    getMethodDisplayName(methodName) {
        const methodMap = {
            [config.CONTRACT_METHODS.REGISTER]: "注册",
            [config.CONTRACT_METHODS.CHECKIN]: "训练",
            [config.CONTRACT_METHODS.CLAIM_REWARDS]: "提取团队奖励",
            [config.CONTRACT_METHODS.CLAIM_UPLINE_REWARD]: "提取训练奖励"
        };
        return methodMap[methodName] || methodName;
    }

    // 记录交易信息
    logTransactionInfo(info) {
        console.log(`
            📌 执行方法: ${info.method}
            📌 交易区块: ${info.blockNumber}
            📌 交易时间: ${info.time}
            📌 交易序号: ${info.index}
            📌 总付款ETH: ${info.ethValue}
            📌 实际gasFee: ${info.gasFee}
            📌 交易哈希: ${info.hash}
            ⬇️ 执行地址: ${info.from}${info.referrer ? `\n🚀 绑定地址: ${info.referrer}` : ''}
        `);
    }

    // 检查交易是否已存在
    async isTransactionExists(txHash) {
        try {
            const models = [RegisterTransaction, CheckinTransaction, ClaimRewardsTransaction, ClaimUplineRewardTransaction];
            
            for (const Model of models) {
                const exists = await Model.findOne({ txHash });
                if (exists) return true;
            }
            return false;
        } catch (error) {
            console.error(`检查交易存在性失败: ${txHash}`, error.message);
            return false;
        }
    }

    // 保存交易到数据库
    async saveTransactionToDatabase(parsedTx, tx, block, receipt, eventData) {
        try {
            // 构建基础交易数据
            const baseData = {
                txHash: tx.hash,
                blockNumber: tx.blockNumber,
                blockTimestamp: new Date(block.timestamp * 1000),
                transactionIndex: tx.index,
                fromAddress: tx.from,
                ethValue: ethers.formatEther(tx.value),
                gasFee: ethers.formatEther(BigInt(receipt.gasUsed) * BigInt(tx.gasPrice)),
                gasPrice: ethers.formatEther(tx.gasPrice),
                gasUsed: receipt.gasUsed.toString(),
                methodName: parsedTx.name
            };

            let savedTransaction = null;

            // 根据方法名保存到不同的集合
            switch (parsedTx.name) {
                case config.CONTRACT_METHODS.REGISTER:
                    const [referrerAddress] = parsedTx.args;
                    savedTransaction = new RegisterTransaction({
                        ...baseData,
                        referrerAddress: referrerAddress
                    });
                    break;

                case config.CONTRACT_METHODS.CHECKIN:
                    savedTransaction = new CheckinTransaction({
                        ...baseData,
                        tokensEarned: eventData.transfer ? eventData.transfer.tokenAmount : '0'
                    });
                    break;

                case config.CONTRACT_METHODS.CLAIM_REWARDS:
                    savedTransaction = new ClaimRewardsTransaction({
                        ...baseData,
                        usdtAmount: eventData.pointsClaimed ? eventData.pointsClaimed.usdtAmount : '0',
                        tokenAmount: eventData.pointsClaimed ? eventData.pointsClaimed.tokenAmount : '0'
                    });
                    break;

                case config.CONTRACT_METHODS.CLAIM_UPLINE_REWARD:
                    savedTransaction = new ClaimUplineRewardTransaction({
                        ...baseData,
                        tokenAmount: eventData.transfer ? eventData.transfer.tokenAmount : '0',
                        recipientAddress: eventData.transfer ? eventData.transfer.to : ''
                    });
                    break;

                default:
                    console.log(`未知的方法类型: ${parsedTx.name}`);
                    return;
            }

            if (savedTransaction) {
                await savedTransaction.save();
                console.log(`✅ 交易已保存到数据库: ${tx.hash} (${this.getMethodDisplayName(parsedTx.name)})`);
                
                // 记录交易信息到控制台
                this.logTransactionInfo({
                    method: this.getMethodDisplayName(parsedTx.name),
                    blockNumber: tx.blockNumber,
                    time: new Date(block.timestamp * 1000).toLocaleString(),
                    index: tx.index,
                    ethValue: ethers.formatEther(tx.value),
                    gasFee: ethers.formatEther(BigInt(receipt.gasUsed) * BigInt(tx.gasPrice)),
                    hash: tx.hash,
                    from: tx.from,
                    referrer: parsedTx.name === config.CONTRACT_METHODS.REGISTER ? parsedTx.args[0] : null
                });
            }

        } catch (error) {
            console.error(`保存交易到数据库失败: ${tx.hash}`, error.message);
        }
    }
}

// 启动扫描器
async function main() {
    const scanner = new BlockchainScanner();
    
    try {
        await scanner.init();
        console.log('🎉 区块链扫描完成');
    } catch (error) {
        console.error('❌ 扫描过程中发生错误:', error);
    } finally {
        // 关闭数据库连接
        await database.disconnect();
        console.log('👋 程序退出');
    }
}

// 优雅关闭处理
async function gracefulShutdown(signal) {
    console.log(`\n收到 ${signal} 信号，正在优雅关闭...`);
    try {
        await database.disconnect();
        console.log('✅ 数据库连接已关闭');
        process.exit(0);
    } catch (error) {
        console.error('❌ 关闭过程中发生错误:', error);
        process.exit(1);
    }
}

// 错误处理和信号监听
process.on('unhandledRejection', (error) => {
    console.error('❌ 未处理的Promise拒绝:', error);
    gracefulShutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
    console.error('❌ 未捕获的异常:', error);
    gracefulShutdown('uncaughtException');
});

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// 启动应用
main().catch(async (error) => {
    console.error('❌ 应用启动失败:', error);
    await database.disconnect();
    process.exit(1);
});