// Dashboard reliability patch.
// Refreshes the current Supabase session so updated app_metadata is in the JWT,
// then explicitly reloads orders and inventory after the page is ready.
(() => {
    async function refreshDashboardData() {
        try {
            if (!window.supabase || typeof supabaseClient === 'undefined') return;

            const { data: sessionData, error: sessionError } = await supabaseClient.auth.refreshSession();
            if (sessionError) {
                console.error('Dashboard session refresh failed:', sessionError);
            }

            if (!sessionData?.session) return;

            if (typeof loadOrders === 'function') {
                await loadOrders();
            }
            if (typeof loadInventory === 'function') {
                await loadInventory();
            }

            console.log('Sky Sweet Treats dashboard data refreshed.');
        } catch (error) {
            console.error('Dashboard refresh failed:', error);
            const panel = document.getElementById('orders-panel');
            if (panel && panel.children.length === 0) {
                panel.innerHTML = '<div class="empty-state"><p>⚠️ Could not load orders.</p><p>Please log out and log back in.</p></div>';
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', refreshDashboardData, { once: true });
    } else {
        refreshDashboardData();
    }
})();
