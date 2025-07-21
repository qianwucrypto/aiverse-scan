// 配置文件
module.exports = {
  // 网络配置
  RPC_URL: "https://base-mainnet.infura.io/v3/3f57f5cd1a3d4cf1abdeed5c6997238c",
  CONTRACT_ADDRESS: "0xE3C3b0F2897122D30BdA2A04fF6b8C146131eF25",
  START_BLOCK: 32894578,
  
  // 扫描配置
  BATCH_SIZE: 500,
  
  // 合约方法枚举
  CONTRACT_METHODS: {
    REGISTER: "register",
    CHECKIN: "checkIn", 
    CLAIM_REWARDS: "claimRewards",
    CLAIM_UPLINE_REWARD: "claimUplineRewards"
  },
  
  // 事件签名
  EVENT_SIGNATURES: {
    POINTS_CLAIMED: 'PointsClaimed(address,uint256,uint256)',
    TRANSFER: 'Transfer(address,address,uint256)'
  },

  // 事件接口
  EVENT_INTERFACES: {
    POINTS_CLAIMED: 'event PointsClaimed(address indexed user, uint256 points, uint256 totalClaimedPoints)',
    TRANSFER: 'event Transfer(address indexed from, address indexed to, uint256 value)'
  },

  // MongoDB配置
  MONGODB: {
    URL: "mongodb://localhost:27017",
    DATABASE: "blockchain_scanner",
    COLLECTIONS: {
      REGISTER: "register_transactions",
      CHECKIN: "checkin_transactions", 
      CLAIM_REWARDS: "claim_rewards_transactions",
      CLAIM_UPLINE_REWARD: "claim_upline_reward_transactions"
    }
  }
};