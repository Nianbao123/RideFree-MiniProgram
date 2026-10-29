// 云函数：rentBike —— 扫码租车
const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const bikeId = (event.bikeId || "").toString().trim();

  if (!bikeId) {
    return { success: false, errMsg: "缺少 bikeId" };
  }

  try {
    // 1. 查询车辆
    const bikeRes = await db.collection("bikes").where({ bikeId }).get();
    if (!bikeRes.data.length) {
      return { success: false, errMsg: "车辆不存在：" + bikeId };
    }
    const bike = bikeRes.data[0];
    if (bike.status !== "available") {
      return { success: false, errMsg: "车辆不可用，当前状态：" + bike.status };
    }

    // 2. 校验是否已有进行中的订单
    const unFinished = await db
      .collection("orders")
      .where({ userId: OPENID, endTime: null })
      .get();
    if (unFinished.data.length) {
      return { success: false, errMsg: "您有进行中的订单，请先还车" };
    }

    // 3. 创建订单（bikeId + startTime，另存 userId 用于还车时定位订单）
    const now = new Date();
    const addRes = await db.collection("orders").add({
      data: {
        bikeId,
        userId: OPENID, // 云函数写入不会自动带 _openid，需自己存
        startTime: now,
        endTime: null, // 未结束标记，便于还车时查询
        fee: 0,
      },
    });

    // 4. 车辆置为使用中
    await db.collection("bikes").doc(bike._id).update({
      data: { status: "in_use" },
    });

    return {
      success: true,
      orderId: addRes._id,
      bikeId,
      startTime: now,
    };
  } catch (e) {
    return { success: false, errMsg: e.message || String(e) };
  }
};
