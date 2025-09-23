export function validateForm(formElement) {
    let isValid = true;
    const inputs = formElement.querySelectorAll('input[required], select[required], textarea[required]');

    // Clear previous errors
    formElement.querySelectorAll('.error-message').forEach(el => el.textContent = '');

    inputs.forEach(input => {
        const value = input.value.trim();
        const errorEl = input.parentElement.querySelector('.error-message');
        let errorMessage = '';

        if (!value) {
            errorMessage = 'Kolom ini tidak boleh kosong.';
        } else if (input.type === 'number' && input.min && parseFloat(value) < parseFloat(input.min)) {
            errorMessage = `Nilai tidak boleh kurang dari ${input.min}.`;
        } else if (input.minLength && value.length < input.minLength) {
            errorMessage = `Minimal harus ${input.minLength} karakter.`;
        }

        if (errorMessage) {
            isValid = false;
            if (errorEl) {
                errorEl.textContent = errorMessage;
            }
        }
    });

    return isValid;
}
