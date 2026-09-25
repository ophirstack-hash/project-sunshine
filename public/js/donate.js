document.addEventListener('DOMContentLoaded', () => {
  const quickBtns = document.querySelectorAll('.quick-amt-btn');
  const customAmountInput = document.getElementById('custom-amount');
  const referralInput = document.getElementById('referral_code');
  const form = document.getElementById('donation-form');

  if (!form) return;

  // Auto-fill stored referral code from localStorage
  const savedRef = localStorage.getItem('trannity_referral_code') || localStorage.getItem('trannity_ref_code');
  if (savedRef && referralInput) {
    referralInput.value = savedRef;
  }

  // Quick Amount Button Click Handlers
  quickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      quickBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (customAmountInput) customAmountInput.value = btn.getAttribute('data-amount');
    });
  });

  if (customAmountInput) {
    customAmountInput.addEventListener('input', () => {
      quickBtns.forEach(b => b.classList.remove('active'));
    });
  }

  // Handle Form Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = document.getElementById('submit-donate-btn');
    const amountVal = parseFloat(customAmountInput?.value);

    if (isNaN(amountVal) || amountVal <= 0) {
      alert('Please enter a valid donation amount.');
      return;
    }

    if (submitBtn) {
      submitBtn.innerText = 'Processing Donation...';
      submitBtn.disabled = true;
    }

    const payload = {
      amount: amountVal,
      full_name: document.getElementById('full_name')?.value || '',
      email: document.getElementById('email')?.value || '',
      phone: document.getElementById('phone')?.value || '',
      address: document.getElementById('address')?.value || '',
      city: document.getElementById('city')?.value || '',
      state: document.getElementById('state')?.value || '',
      country: document.getElementById('country')?.value || '',
      zip_code: document.getElementById('zip_code')?.value || '00000',
      payment_method: 'wire',
      referral_code: referralInput?.value.trim() || null
    };

    try {
      // Pointing to the exact endpoint matching api.js
      const response = await fetch('/api/donate/private-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert(`Thank you, ${payload.full_name}! Your donation was recorded successfully.\nDonation ID: ${data.donationId}`);
        window.location.href = '/';
      } else {
        alert(data.error || 'Failed to record donation. Please try again.');
        if (submitBtn) {
          submitBtn.innerText = 'Complete Secure Donation';
          submitBtn.disabled = false;
        }
      }
    } catch (err) {
      console.error('Donation request failed:', err);
      alert('Network or server connection error. Please try again.');
      if (submitBtn) {
        submitBtn.innerText = 'Complete Secure Donation';
        submitBtn.disabled = false;
      }
    }
  });
});