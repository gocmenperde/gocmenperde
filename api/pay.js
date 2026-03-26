import Iyzipay from "iyzipay";

const iyzipay = new Iyzipay({
  apiKey: "API_KEY",
  secretKey: "SECRET_KEY",
  uri: "https://sandbox-api.iyzipay.com"
});

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(200).json({ message: "API çalışıyor" });
  }

  const request = {
    locale: "tr",
    conversationId: "123456",
    price: "100",
    paidPrice: "100",
    currency: "TRY",
    basketId: "B67832",
    paymentGroup: "PRODUCT",
    callbackUrl: "https://gocmenperde.com.tr"
  };

  iyzipay.checkoutFormInitialize.create(request, function (err, result) {
    res.status(200).json(result);
  });

}