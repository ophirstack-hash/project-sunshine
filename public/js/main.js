document.addEventListener('DOMContentLoaded', async () => {
  // 1. Fetch and render live campaign statistics
  fetchCampaignStats();

  // 2. Handle incoming referral link parameters
  handleReferrals();
});

// Fetch Live Campaign Data from API
async function fetchCampaignStats() {
  try {
    const response = await fetch(`/api/campaign?t=${Date.now()}`);
    if (!response.ok) throw new Error('Failed to fetch campaign data');

    const data = await response.json();

    const raised = data.raised_amount || 0;
    const target = data.target_amount || data.goal_amount || 3000000;
    const donors = data.current_donors || data.donor_count || 0;

    const percentage = Math.min(100, Math.round((raised / target) * 100));

    const statRaised = document.getElementById('stat-raised');
    const statGoal = document.getElementById('stat-goal');
    const statDonors = document.getElementById('stat-donors');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');

    if (statRaised) statRaised.innerText = `$${Number(raised).toLocaleString()}`;
    if (statGoal) statGoal.innerText = `$${Number(target).toLocaleString()}`;
    if (statDonors) statDonors.innerText = Number(donors).toLocaleString();

    if (progressBar) progressBar.style.width = `${percentage}%`;
    if (progressText) {
      progressText.innerText = `${percentage}% of our $${Number(target).toLocaleString()} goal reached!`;
    }
  } catch (error) {
    console.error('Error loading campaign stats:', error);
    const progressText = document.getElementById('progress-text');
    if (progressText) progressText.innerText = 'Unable to load live statistics.';
  }
}

// Handle Referral Codes & Admin Trackers
async function handleReferrals() {
  const urlParams = new URLSearchParams(window.location.search);
  const refCode = urlParams.get('ref') || urlParams.get('r');

  if (!refCode) return;

  // Sync keys across local storage and cookie for subpages
  localStorage.setItem('trannity_referral_code', refCode);
  localStorage.setItem('trannity_ref_code', refCode);
  document.cookie = `trannity_referral_code=${refCode}; path=/; max-age=2592000`;

  try {
    const response = await fetch(`/api/referral/click/${encodeURIComponent(refCode)}`, {
      method: 'POST'
    });

    if (response.ok) {
      const data = await response.json();
      const referrerName = data.referrer_name || 'a friend';

      const banner = document.getElementById('referral-banner');
      if (banner) {
        banner.style.display = 'block';
        banner.style.padding = '14px 20px';
        banner.style.marginBottom = '25px';
        banner.style.backgroundColor = '#E8F5E9';
        banner.style.color = '#2E7D32';
        banner.style.border = '1px solid #C8E6C9';
        banner.style.borderRadius = '8px';
        banner.style.fontWeight = '600';
        banner.style.textAlign = 'center';
        banner.innerHTML = `🤝 You were invited by <strong>${escapeHtml(referrerName)}</strong>! Your donation directly supports their outreach goal.`;
      }
    }
  } catch (err) {
    console.error('Error processing referral link:', err);
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}