/*
 * Sky Sweet Treats — staff push notifications
 *
 * Lets staff opt in to Web Push so they get notified of new incoming orders
 * even if the phone is locked or the dashboard tab/app is closed. Requires:
 *   - sw.js registered with 'push' + 'notificationclick' handlers
 *   - Supabase table push_subscriptions (subscriber_type='staff')
 *   - Edge Functions: vapid-public-key (public), send-push (called by DB trigger)
 */
(function () {
    const VAPID_KEY_ENDPOINT = 'https://rmtberbypsjcydomvhvu.supabase.co/functions/v1/vapid-public-key';

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = atob(base64);
        return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
    }

    async function getReadyRegistration() {
        let reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
            reg = await navigator.serviceWorker.register('sw.js');
        }
        await navigator.serviceWorker.ready;
        return reg;
    }

    async function fetchVapidPublicKey() {
        const res = await fetch(VAPID_KEY_ENDPOINT);
        if (!res.ok) throw new Error('Could not load push config');
        const json = await res.json();
        if (!json.publicKey) throw new Error('Push not configured');
        return json.publicKey;
    }

    async function saveSubscription(subscription) {
        const json = subscription.toJSON();
        const { error } = await supabaseClient.from('push_subscriptions').upsert(
            {
                subscriber_type: 'staff',
                tracking_token: null,
                endpoint: json.endpoint,
                p256dh: json.keys.p256dh,
                auth: json.keys.auth
            },
            { onConflict: 'endpoint' }
        );
        if (error) throw error;
    }

    function setButtonState(state) {
        const btn = document.getElementById('notify-btn');
        if (!btn) return;
        if (state === 'on') {
            btn.textContent = '🔔 On';
            btn.disabled = true;
            btn.classList.add('notify-on');
        } else if (state === 'unsupported') {
            btn.style.display = 'none';
        } else if (state === 'loading') {
            btn.textContent = '⏳…';
            btn.disabled = true;
        } else {
            btn.textContent = '🔔 Enable alerts';
            btn.disabled = false;
            btn.classList.remove('notify-on');
        }
    }

    window.enableStaffNotifications = async function () {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            if (typeof showToast === 'function') showToast('⚠️ Notifications aren\'t supported on this browser');
            return false;
        }

        setButtonState('loading');
        try {
            const reg = await getReadyRegistration();
            let sub = await reg.pushManager.getSubscription();

            if (!sub) {
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') {
                    if (typeof showToast === 'function') showToast('🔕 Notifications not enabled');
                    setButtonState('off');
                    return false;
                }
                const vapidKey = await fetchVapidPublicKey();
                sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(vapidKey)
                });
            }

            await saveSubscription(sub);
            setButtonState('on');
            if (typeof showToast === 'function') showToast('🔔 You\'ll be notified of new orders!');
            return true;
        } catch (err) {
            console.error('Push subscribe error:', err);
            setButtonState('off');
            if (typeof showToast === 'function') showToast('❌ Could not enable notifications');
            return false;
        }
    };

    async function checkExistingSubscription() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            setButtonState('unsupported');
            return;
        }
        if (Notification.permission !== 'granted') {
            setButtonState('off');
            return;
        }
        try {
            const reg = await getReadyRegistration();
            const sub = await reg.pushManager.getSubscription();
            setButtonState(sub ? 'on' : 'off');
        } catch (e) {
            setButtonState('off');
        }
    }

    window.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('notify-btn');
        if (btn) btn.addEventListener('click', window.enableStaffNotifications);
        checkExistingSubscription();
    });
})();
