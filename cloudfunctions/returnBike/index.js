// 云函数：returnBike —— 还车结算
const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const PRICE_PER_MINUTE = 0.1; // 0.1 元/分钟

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const orderId = event.orderId;

  try {
    // 1. 找到该用户最新一条未结束的订单
    let order = null;
    if (orderId) {
      const res = await db.collection("orders").doc(orderId).get();
      order = res.data;
    } else {
      const res = await db
        .collection("orders")
        .where({ userId: OPENID, endTime: null })
        .orderBy("startTime", "desc")
        .limit(1)
        .get();
      order = res.data[0] || null;
    }

    if (!order) {
      return { success: false, errMsg: "没有进行中的订单" };
    }
    if (order.userId && order.userId !== OPENID) {
      return { success: false, errMsg: "无权操作该订单" };
    }
    if (order.endTime) {
      return { success: false, errMsg: "该订单已结算" };
    }

    // 2. 计算时长与费用
    const endTime = new Date();
    const startMs =
      order.startTime instanceof Date
        ? order.startTime.getTime()
        : new Date(order.startTime).getTime();
    const minutes = Math.max(1, Math.ceil((endTime.getTime() - startMs) / 60000));
    const fee = Math.round(minutes * PRICE_PER_MINUTE * 100) / 100;

    // 3. 更新订单
    await db.collection("orders").doc(order._id).update({
      data: { endTime, fee, minutes },
    });

    // 4. 车辆恢复可用
    const bikeRes = await db
      .collection("bikes")
      .where({ bikeId: order.bikeId })
      .get();
    if (bikeRes.data.length) {
      await db.collection("bikes").doc(bikeRes.data[0]._id).update({
        data: { status: "available" },
      });
    }

    return {
      success: true,
      bikeId: order.bikeId,
      startTime: order.startTime,
      endTime,
      minutes,
      fee,
    };
  } catch (e) {
    return { success: false, errMsg: e.message || String(e) };
  }
};
