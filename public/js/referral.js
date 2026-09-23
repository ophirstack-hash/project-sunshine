(function () {
  const urlParams = new URLSearchParams(window.location.search);
  const refCode = urlParams.get('ref') || urlParams.get('r');

  if (refCode) {
    // Standardize across both storage keys
    localStorage.setItem('trannity_referral_code', refCode);
    localStorage.setItem('trannity_ref_code', refCode);
    document.cookie = `trannity_referral_code=${refCode}; path=/; max-age=2592000`;

    fetch(`/api/referral/${refCode}`)
      .then(res => res.json())
      .then(data => {
        if (data.valid) {
          const banner = document.getElementById('referral-banner');
          if (banner) {
            banner.style.display = 'block';
            banner.innerHTML = `❤️ You were invited to support Project Sunshine by <strong>${data.referrerName || data.referrer_name}</strong>.`;
          }
        }
      })
      .catch(err => console.error('Referral check failed:', err));
  }
})();