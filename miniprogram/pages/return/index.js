// pages/return/index.js
function formatTime(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  const p = (n) => (n < 10 ? "0" + n : "" + n);
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes()
  )}`;
}

Page({
  data: {
    order: null,
    result: null,
    loading: false,
  },

  onShow() {
    const order = wx.getStorageSync("currentOrder");
    this.setData({
      order: order
        ? { bikeId: order.bikeId, startTimeText: formatTime(order.startTime) }
        : null,
    });
  },

  onReturn() {
    if (this.data.loading) return;
    const order = wx.getStorageSync("currentOrder");
    if (!order) {
      wx.showToast({ icon: "none", title: "当前没有进行中的订单" });
      return;
    }

    this.setData({ loading: true });
    wx.showLoading({ title: "结算中" });

    wx.cloud
      .callFunction({
        name: "returnBike",
        data: { orderId: order.orderId },
      })
      .then((res) => {
        wx.hideLoading();
        const r = (res && res.result) || {};
        if (r.success) {
          wx.removeStorageSync("currentOrder");
          this.setData({
            order: null,
            result: {
              fee: r.fee.toFixed(2),
              minutes: r.minutes,
              startTimeText: formatTime(r.startTime),
              endTimeText: formatTime(r.endTime),
            },
          });
          wx.showModal({
            title: "还车成功",
            content: `本次费用 ¥ ${r.fee.toFixed(2)}（${r.minutes} 分钟）`,
            showCancel: false,
          });
        } else {
          wx.showModal({
            title: "还车失败",
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
            title: "请上传云函数",
            content:
              "在 cloudfunctions/returnBike 右键选择【上传并部署：云端安装依赖】后重试",
            showCancel: false,
          });
          return;
        }
        wx.showModal({
          title: "还车失败",
          content: msg || "请检查云环境是否正确",
          showCancel: false,
        });
      })
      .then(() => {
        this.setData({ loading: false });
      });
  },
});
