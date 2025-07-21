const mongoose = require('mongoose');
const config = require('./config');

class DatabaseManager {
  constructor() {
    this.isConnected = false;
  }

  // 连接数据库
  async connect() {
    try {
      if (this.isConnected) {
        return;
      }

      await mongoose.connect(config.MONGODB.URL, {
        dbName: config.MONGODB.DATABASE,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      this.isConnected = true;
      console.log('✅ MongoDB连接成功');

      // 监听连接事件
      mongoose.connection.on('error', (error) => {
        console.error('❌ MongoDB连接错误:', error);
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        console.log('⚠️ MongoDB连接断开');
        this.isConnected = false;
      });

    } catch (error) {
      console.error('❌ MongoDB连接失败:', error);
      throw error;
    }
  }

  // 断开连接
  async disconnect() {
    try {
      if (this.isConnected) {
        await mongoose.connection.close();
        this.isConnected = false;
        console.log('✅ MongoDB连接已关闭');
      }
    } catch (error) {
      console.error('❌ 关闭MongoDB连接失败:', error);
    }
  }

  // 检查连接状态
  isConnectionReady() {
    return this.isConnected && mongoose.connection.readyState === 1;
  }
}

module.exports = new DatabaseManager();