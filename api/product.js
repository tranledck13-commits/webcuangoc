const PRODUCT_DATA_API = "https://data.addlivetag.com/product-data/product-data.php";

function send(res, status, body) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    if (status === 204) return res.status(204).end();
    return res.status(status).json(body);
}

function isShopeeHost(hostname) {
    const host = String(hostname || "").toLowerCase();
    return host === "shopee.vn" || host.endsWith(".shopee.vn") || host === "shp.ee" || host.endsWith(".shp.ee");
}

function extractIds(url) {
    const value = String(url || "");
    const match = value.match(/\/product\/(\d+)\/(\d+)/i)
        || value.match(/-i\.(\d+)\.(\d+)/i)
        || value.match(/\/opaanlp\/(\d+)\/(\d+)/i);
    return match ? { shopId:match[1], itemId:match[2] } : null;
}

async function resolveShopeeUrl(inputUrl) {
    const parsed = new URL(inputUrl);
    if (!isShopeeHost(parsed.hostname)) throw new Error("Link Shopee khong hop le");
    if (extractIds(inputUrl)) return inputUrl;
    const response = await fetch(inputUrl, {
        redirect:"follow",
        headers:{ "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36" },
    });
    if (!response.ok) throw new Error(`Khong mo duoc link ngan (HTTP ${response.status})`);
    return response.url;
}

function normalizeProduct(info, resolvedUrl) {
    const ids = extractIds(info.productLink || resolvedUrl) || {};
    const sourceCommission = Number(info.commission) || 0;
    return {
        productName:String(info.productName || ""),
        imageUrl:String(info.imageUrl || ""),
        price:Number(info.price) || 0,
        sales:Number(info.sales) || 0,
        rating:Number(info.rating) || 0,
        shopId:String(ids.shopId || ""),
        itemId:String(info.itemId || ids.itemId || ""),
        productLink:String(info.productLink || resolvedUrl || ""),
        estimatedCommission:Math.round(sourceCommission * 0.5),
    };
}

export default async function handler(req, res) {
    if (req.method === "OPTIONS") return send(res, 204, null);
    if (req.method !== "GET") return send(res, 405, { status:"error", message:"Chi ho tro GET" });
    try {
        const inputUrl = String(req.query.url || "").trim();
        if (!inputUrl) return send(res, 400, { status:"error", message:"Thieu tham so url" });
        const resolvedUrl = await resolveShopeeUrl(inputUrl);
        const ids = extractIds(resolvedUrl);
        const upstreamUrl = ids?.itemId
            ? `${PRODUCT_DATA_API}?item_id=${encodeURIComponent(ids.itemId)}`
            : `${PRODUCT_DATA_API}?url=${encodeURIComponent(resolvedUrl)}`;
        const upstream = await fetch(upstreamUrl, { headers:{ Accept:"application/json" } });
        const data = await upstream.json();
        if (!upstream.ok || data.status !== "success" || !data.productInfo) {
            throw new Error(data.message || `Product Data API HTTP ${upstream.status}`);
        }
        return send(res, 200, {
            status:"success",
            productInfo:normalizeProduct(data.productInfo, resolvedUrl),
        });
    } catch (error) {
        return send(res, 400, { status:"error", message:error.message });
    }
}

export { extractIds, normalizeProduct };
