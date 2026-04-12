// server/lib/_paytr-config.js
module.exports = {
  getPaytrCredentials: () => {
    // Vercel'den okumayı bırakıp doğrudan değerleri yazıyoruz
    const id = "690414";
    const key = "qiyTzuAETF2mB8pk";
    const salt = "4o3qjuMhFhc7DpQH";

    return {
      merchantId: id,
      merchantKey: key,
      merchantSalt: salt,
      hasRequiredCredentials: true
    };
  }
};
