import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { buildAuthorization, buildPayload, buildProductPayload, extractProductIds, normalizeProduct } from "./index.js";

test("buildAuthorization creates expected SHA256 header", () => {
    const appId = "123456";
    const secret = "secret_key";
    const payload = JSON.stringify({ query: "{ shopeeOfferV2 { pageInfo { page } } }" });
    const timestamp = 1712000000;
    const expectedSignature = crypto
        .createHash("sha256")
        .update(`${appId}${timestamp}${payload}${secret}`)
        .digest("hex");

    const actual = buildAuthorization(appId, secret, payload, timestamp);

    assert.equal(
        actual,
        `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${expectedSignature}`,
    );
});

test("buildPayload supports generateShortLink and injects input URL", () => {
    const inputUrl = "https://shopee.vn/product/38003654/1589295236";
    const payload = buildPayload("generateShortLink", inputUrl);
    const parsed = JSON.parse(payload);

    assert.match(parsed.query, /generateShortLink/);
    assert.match(parsed.query, new RegExp(inputUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("buildPayload throws for unsupported apiName", () => {
    assert.throws(
        () => buildPayload("unknownApi", "https://shopee.vn"),
        /Unsupported api name/,
    );
});

test("extractProductIds supports both common Shopee URL formats", () => {
    assert.deepEqual(extractProductIds("https://shopee.vn/product/38003654/1589295236"), { shopId:"38003654", itemId:"1589295236" });
    assert.deepEqual(extractProductIds("https://shopee.vn/ao-dep-i.38003654.1589295236"), { shopId:"38003654", itemId:"1589295236" });
});

test("buildProductPayload requests all required product and commission fields", () => {
    const query = JSON.parse(buildProductPayload("38003654", "1589295236")).query;
    assert.match(query, /shopId: 38003654/);
    assert.match(query, /itemId: 1589295236/);
    assert.match(query, /productName imageUrl priceMin priceMax sales ratingStar/);
    assert.match(query, /shopId itemId commission/);
});

test("normalizeProduct calculates estimated commission at 50 percent", () => {
    const product = normalizeProduct({ productName:"Ao", commission:"19999", priceMin:"100000", sales:12, ratingStar:"4.8", shopId:"1", itemId:"2" });
    assert.equal('originalCommission' in product, false);
    assert.equal(product.estimatedCommission, 10000);
    assert.equal('estimatedCommissionRate' in product, false);
});
