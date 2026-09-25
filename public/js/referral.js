// Lightweight sync script for secondary subpages where main.js is not loaded
(function () {
  const urlParams = new URLSearchParams(window.location.search);
  const refCode = urlParams.get('ref') || urlParams.get('r');

  if (refCode) {
    localStorage.setItem('trannity_referral_code', refCode);
    localStorage.setItem('trannity_ref_code', refCode);
    document.cookie = `trannity_referral_code=${refCode}; path=/; max-age=2592000`;
  }
})();