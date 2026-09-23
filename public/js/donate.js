document.addEventListener('DOMContentLoaded', () => {
  const quickBtns = document.querySelectorAll('.quick-amt-btn');
  const customAmountInput = document.getElementById('custom-amount');
  const referralInput = document.getElementById('referral_code');
  const form = document.getElementById('donation-form');

  // Auto-fill stored referral code from referral.js / cookies
  const savedRef = localStorage.getItem('trannity_referral_code');
  if (savedRef && referralInput) {
    referralInput.value = savedRef;
  }

  // Quick Amount Button Click Handlers
  quickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      quickBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      customAmountInput.value = btn.getAttribute('data-amount');
    });
  });

  customAmountInput.addEventListener('input', () => {
    quickBtns.forEach(b => b.classList.remove('active'));
  });

  // Handle Form Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submit-donate-btn');
    submitBtn.innerText = 'Processing Donation...';
    submitBtn.disabled = true;

    const payload = {
      amount: parseFloat(customAmountInput.value),
      full_name: document.getElementById('full_name').value,
      email: document.getElementById('email').value,
      phone: document.getElementById('phone').value,
      address: document.getElementById('address').value,
      city: document.getElementById('city').value,
      state: document.getElementById('state').value,
      country: document.getElementById('country').value,
      zip_code: document.getElementById('zip_code').value || '00000',
      referral_code: referralInput.value.trim() || null
    };

    try {
      const response = await fetch('/api/donate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert(`Thank you, ${payload.full_name}! Your donation was processed successfully.\nDonation ID: ${data.donationId}`);
        window.location.href = '/';
      } else {
        alert(data.error || 'Failed to record donation. Please check server logs.');
        submitBtn.innerText = 'Complete Secure Donation';
        submitBtn.disabled = false;
      }
    } catch (err) {
      console.error('Donation request failed:', err);
      alert('Network or server connection error. Please try again.');
      submitBtn.innerText = 'Complete Secure Donation';
      submitBtn.disabled = false;
    }
  });
});