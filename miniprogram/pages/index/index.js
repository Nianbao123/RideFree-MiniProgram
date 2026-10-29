// pages/index/index.js
const DEFAULT_LAT = 30.5931; // 校园默认中心点（安徽大学），可自行修改
const DEFAULT_LNG = 114.3055;

function formatTime(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  const p = (n) => (n < 10 ? "0" + n : "" + n);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

Page({
  data: {
    latitude: DEFAULT_LAT,
    longitude: DEFAULT_LNG,
    scale: 16,
    markers: [],
    renting: false,
    currentOrder: null,
  },

  onLoad() {
    this.refreshOrder();
  },

  onShow() {
    this.loadBikes();
    this.refreshOrder();
  },

  onPullDownRefresh() {
    this.loadBikes(() => wx.stopPullDownRefresh());
  },

  // 读取本地保存的进行中订单
  refreshOrder() {
    const order = wx.getStorageSync("currentOrder");
    if (!order) {
      this.setData({ currentOrder: null });
      return;
    }
    this.setData({
      currentOrder: {
        orderId: order.orderId,
        bikeId: order.bikeId,
        startTimeText: formatTime(order.startTime),
      },
    });
  },

  // 拉取 status 为 available 的车辆
  loadBikes(done) {
    wx.cloud
      .database()
      .collection("bikes")
      .where({ status: "available" })
      .get()
      .then((res) => {
        const list = res.data || [];
        const markers = list.map((b, i) => ({
          id: i,
          bikeId: b.bikeId,
          type: b.type || "单车",
          latitude: Number(b.latitude),
          longitude: Number(b.longitude),
          width: 32,
          height: 32,
          callout: {
            content: `${b.bikeId} · ${b.type || "单车"}`,
            display: "BYCLICK",
            padding: 6,
            borderRadius: 4,
            bgColor: "#ffffff",
          },
        }));
        const data = { markers };
        if (markers.length) {
          data.latitude = markers[0].latitude;
          data.longitude = markers[0].longitude;
        }
        this.setData(data);
        if (done) done();
      })
      .catch((err) => {
        if (done) done();
        wx.showToast({ icon: "none", title: "车辆加载失败" });
        console.error("loadBikes error", err);
      });
  },

  // 点击地图标记：直接租这辆（调试用）
  onMarkerTap(e) {
    const marker = this.data.markers[e.detail.markerId];
    if (!marker) return;
    wx.showModal({
      title: "车辆信息",
      content: `车牌：${marker.bikeId}\n类型：${marker.type}`,
      confirmText: "租这辆",
      success: (res) => {
        if (res.confirm) this.rentBike(marker.bikeId);
      },
    });
  },

  // 点击车辆卡片：同样触发扫码
  onCardTap() {
    this.onScanRent();
  },

  // 扫码租车
  onScanRent() {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ["qrCode", "barCode"],
      success: (res) => {
        const bikeId = this.parseBikeId(res.result);
        if (!bikeId) {
          wx.showToast({ icon: "none", title: "无法识别二维码内容" });
          return;
        }
        this.rentBike(bikeId);
      },
      fail: () => {
        wx.showToast({ icon: "none", title: "扫码已取消" });
      },
    });
  },

  // 兼容二维码内容为 JSON / URL 参数 / 纯文本
  parseBikeId(raw) {
    if (!raw) return "";
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object") {
        return obj.bikeId || obj.id || obj.bike_id || "";
      }
    } catch (e) {}
    const m = /(?:bikeId|id)=([^&\s]+)/i.exec(raw);
    if (m) return decodeURIComponent(m[1]);
    const seg = String(raw).split("/").filter(Boolean).pop();
    return decodeURIComponent(seg || "");
  },

  // 调用云函数 rentBike
  rentBike(bikeId) {
    if (this.data.renting) return;
    this.setData({ renting: true });
    wx.showLoading({ title: "正在启动车辆" });

    wx.cloud
      .callFunction({ name: "rentBike", data: { bikeId } })
      .then((res) => {
        wx.hideLoading();
        const r = (res && res.result) || {};
        if (r.success) {
          wx.setStorageSync("currentOrder", {
            orderId: r.orderId,
            bikeId: r.bikeId,
            startTime: r.startTime,
          });
          this.refreshOrder();
          wx.showModal({
            title: "智能盒子已响应",
            content: "开始计时",
            showCancel: false,
            confirmText: "去还车",
            success: (m) => {
              if (m.confirm) wx.navigateTo({ url: "/pages/return/index" });
            },
          });
          this.loadBikes();
        } else {
          wx.showModal({
            title: "租车失败",
            content: r.errMsg || "请稍后重试",
            showCancel: false,
          });
        }
      })
      .catch((err) => {
        wx.hideLoading();
        const msg = (err && err.errMsg) || "";
        if (msg.includes("FunctionName parameter could not be found")) {
          wx.showModal({
            title: "请部署云函数",
            content:
              "在 cloudfunctions/rentBike 右键选择【创建并部署：云端安装依赖】后重试",
            showCancel: false,
          });
          return;
        }
        wx.showModal({
          title: "租车失败",
          content: msg || "请检查云环境是否正确",
          showCancel: false,
        });
      })
      .then(() => {
        this.setData({ renting: false });
      });
  },

  // 我要出租：Demo 占位
  onRentOut() {
    wx.showToast({
      title: "出租功能即将上线，敬请期待",
      icon: "none",
      duration: 2000,
    });
  },

  goReturn() {
    wx.navigateTo({ url: "/pages/return/index" });
  },
});
