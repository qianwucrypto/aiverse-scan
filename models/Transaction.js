const mongoose = require('mongoose');

// 基础交易模式
const baseTransactionSchema = {
  txHash: { type: String, required: true, unique: true },
  blockNumber: { type: Number, required: true },
  blockTimestamp: { type: Date, required: true },
  transactionIndex: { type: Number, required: true },
  fromAddress: { type: String, required: true },
  ethValue: { type: String, required: true },
  gasFee: { type: String, required: true },
  gasPrice: { type: String, required: true },
  gasUsed: { type: String, required: true },
  methodName: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
};

// 注册交易模式
const registerTransactionSchema = new mongoose.Schema({
  ...baseTransactionSchema,
  referrerAddress: { type: String, required: true }
});

// 签到交易模式
const checkinTransactionSchema = new mongoose.Schema({
  ...baseTransactionSchema,
  tokensEarned: { type: String, default: '0' }
});

// 提取团队奖励交易模式
const claimRewardsTransactionSchema = new mongoose.Schema({
  ...baseTransactionSchema,
  usdtAmount: { type: String, default: '0' },
  tokenAmount: { type: String, default: '0' }
});

// 提取训练奖励交易模式
const claimUplineRewardTransactionSchema = new mongoose.Schema({
  ...baseTransactionSchema,
  tokenAmount: { type: String, default: '0' },
  recipientAddress: { type: String, default: '' }
});

// 创建模型
const RegisterTransaction = mongoose.model('RegisterTransaction', registerTransactionSchema);
const CheckinTransaction = mongoose.model('CheckinTransaction', checkinTransactionSchema);
const ClaimRewardsTransaction = mongoose.model('ClaimRewardsTransaction', claimRewardsTransactionSchema);
const ClaimUplineRewardTransaction = mongoose.model('ClaimUplineRewardTransaction', claimUplineRewardTransactionSchema);

module.exports = {
  RegisterTransaction,
  CheckinTransaction,
  ClaimRewardsTransaction,
  ClaimUplineRewardTransaction
};