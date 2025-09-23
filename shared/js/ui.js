/**
 * Displays a toast notification.
 * @param {string} message The message to display.
 * @param {'info' | 'success' | 'warning' | 'error'} type The type of toast.
 * @param {number} duration Duration in milliseconds.
 */
export function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // Animate in
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);

    // Animate out and remove
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => {
            toast.remove();
        });
    }, duration);
}

// Other UI functions like createModal, createSkeleton can be added here.
