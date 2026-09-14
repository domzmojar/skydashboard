/*
 * Sky Sweet Treats checkout fix
 *
 * This file intentionally overrides only submitOrder(). It works with the
 * existing checkout UI, collectCheckoutData(), and buildOrderText().
 */
(function () {
    function generateTrackingToken() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }

        if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
            const bytes = new Uint8Array(24);
            window.crypto.getRandomValues(bytes);
            return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
        }

        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    }

    function addTrackingTokenToReceipt(text, orderNumber, trackingToken) {
        const oldUrl = `track.html?order=${encodeURIComponent(orderNumber)}`;
        const newUrl = `track.html?order=${encodeURIComponent(orderNumber)}&token=${encodeURIComponent(trackingToken)}`;
        const updated = String(text).replace(oldUrl, newUrl);

        if (updated !== String(text)) return updated;

        const fallbackUrl = `${window.location.origin}/track.html?order=${encodeURIComponent(orderNumber)}&token=${encodeURIComponent(trackingToken)}`;
        return String(text).replace(
            `Track: ${window.location.origin}/track.html?order=${encodeURIComponent(orderNumber)}`,
            `Track: ${fallbackUrl}`
        );
    }

    window.submitOrder = async function () {
        const data = collectCheckoutData();
        if (!data) return;

        const submitBtn = document.getElementById('messenger-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Placing your order...';
        }

        const trackingToken = generateTrackingToken();
        const items = cart.map(i => ({
            product_id: i.parentId || i.id,
            product_name: i.name,
            flavor: i.flavor || null,
            price: i.price,
            qty: i.qty
        }));

        // Pre-open Messenger from the user's button click so the later
        // redirect is less likely to be blocked as a popup.
        let messengerWindow = null;
        try {
            messengerWindow = window.open('about:blank', '_blank');
            if (messengerWindow) messengerWindow.opener = null;
        } catch (popupError) {
            console.warn('Could not pre-open Messenger window:', popupError);
        }

        try {
            const { data: rpcData, error } = await supabaseClient.rpc('place_order', {
                p_customer_name: data.name,
                p_customer_phone: null,
                p_order_type: data.type,
                p_landmark: data.landmark || null,
                p_shipping_zone: data.shippingAddress || null,
                p_shipping_fee: data.shippingFee,
                p_payment_method: data.pay,
                p_exact_amount: data.exactAmount,
                p_amount_given: data.customerAmount,
                p_change_due: data.changeDue,
                p_subtotal: data.subtotal,
                p_total: data.total,
                p_items: items,
                p_tracking_token: trackingToken
            });

            if (error) throw error;

            const orderNumber = rpcData && typeof rpcData === 'object'
                ? rpcData.order_number
                : null;
            const returnedTrackingToken = rpcData && typeof rpcData === 'object'
                ? rpcData.tracking_token
                : null;

            if (!orderNumber || typeof orderNumber !== 'string') {
                throw new Error('Order was created but no order number was returned by the server.');
            }

            if (!returnedTrackingToken || typeof returnedTrackingToken !== 'string') {
                throw new Error('Order was created but no tracking token was returned by the server.');
            }

            window.__lastOrderData = data;
            window.__lastOrderNumber = orderNumber;
            window.__lastOrderTrackingToken = returnedTrackingToken;

            const trackUrl = `track.html?order=${encodeURIComponent(orderNumber)}&token=${encodeURIComponent(returnedTrackingToken)}`;
            let text = buildOrderText(data, orderNumber);
            text = addTrackingTokenToReceipt(text, orderNumber, returnedTrackingToken);

            try {
                await navigator.clipboard.writeText(text);
            } catch (clipboardError) {
                console.warn('Could not copy order receipt:', clipboardError);
            }

            const messengerUrl = `${CONFIG.messengerUrl}?text=${encodeURIComponent(text)}`;
            if (messengerWindow && !messengerWindow.closed) {
                messengerWindow.location.href = messengerUrl;
            } else {
                messengerWindow = null;
            }

            cart = [];
            updateUI();
            loadProducts(false);

            const checkoutModal = document.getElementById('checkout-modal');
            if (checkoutModal) checkoutModal.classList.remove('active');

            // Main tab goes directly to the secure tracking page.
            window.location.assign(trackUrl);
        } catch (err) {
            if (messengerWindow && !messengerWindow.closed) {
                try { messengerWindow.close(); } catch (closeError) {}
            }

            console.error('Error placing order:', err);
            showToast(`❌ ${err?.message || 'Could not place order. Please check your connection and try again.'}`, 5000);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '📱 Send my order';
            }
        }
    };
})();
