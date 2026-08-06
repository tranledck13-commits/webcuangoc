import { buildAuthorization, buildProductPayload, extractProductIds, normalizeProduct } from "../Code/nodejs/index.js";

const SHOPEE_API = "https://open-api.affiliate.shopee.vn/graphql";

function send(res, status, body) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(status).json(body);
}

async function resolveShopeeUrl(inputUrl) {
    const parsed = new URL(inputUrl);
    const allowed = parsed.hostname === "shopee.vn" || parsed.hostname.endsWith(".shopee.vn");
    if (!allowed) throw new Error("Link Shopee khong hop le");
    if (extractIdsSafely(inputUrl)) return inputUrl;
    const response = await fetch(inputUrl, { redirect:"follow", headers:{ "User-Agent":"Mozilla/5.0" } });
    if (!response.ok) throw new Error(`Khong mo duoc link ngan (HTTP ${response.status})`);
    return response.url;
}

function extractIdsSafely(url) {
    try { return extractProductIds(url); } catch (_) { return null; }
}

export default async function handler(req, res) {
    if (req.method === "OPTIONS") return send(res, 204, {});
    if (req.method !== "GET") return send(res, 405, { success:false, error:"Chi ho tro GET" });

    try {
        const inputUrl = String(req.query.url || "").trim();
        if (!inputUrl) return send(res, 400, { success:false, error:"Thieu tham so url" });

        const appId = process.env.SHOPEE_API_APP_ID || "";
        const secret = process.env.SHOPEE_API_SECRET || "";
        if (!appId || !secret) return send(res, 500, { success:false, error:"Chua cau hinh SHOPEE_API_APP_ID/SHOPEE_API_SECRET" });

        const resolvedUrl = await resolveShopeeUrl(inputUrl);
        const { shopId, itemId } = extractProductIds(resolvedUrl);
        const payload = buildProductPayload(shopId, itemId);
        const timestamp = Math.floor(Date.now() / 1000);
        const authorization = buildAuthorization(appId, secret, payload, timestamp);
        const upstream = await fetch(SHOPEE_API, {
            method:"POST",
            headers:{ Authorization:authorization, "Content-Type":"application/json" },
            body:payload,
        });
        const json = await upstream.json();
        if (!upstream.ok || json.errors?.length) {
            throw new Error(json.errors?.[0]?.message || `Shopee API HTTP ${upstream.status}`);
        }
        const node = json.data?.productOfferV2?.nodes?.[0];
        const productInfo = normalizeProduct(node);
        return send(res, 200, { status:"success", success:true, resolvedUrl, productInfo });
    } catch (error) {
        return send(res, 400, { status:"error", success:false, error:error.message });
    }
}
