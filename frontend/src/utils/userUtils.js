export function getSDMStateInfo(user) {
  if (!user || user.is_superuser) {
    return {
      code: 'ALL',
      dashboardTitle: 'SDM DASHBOARD',
      controlCenterTitle: 'Telecom Operational Control Center',
      subtitle: 'State Delivery Manager Control Center',
      intelligenceSubtitle: 'AI-Powered Site Memory & Real-Time Incident Intelligence across Nigeria',
      regionText: 'All Nigeria State Territories',
      footerText: `SDM Dashboard v3.0 • Logged in as: ${user?.full_name || 'Super Administrator'} (Super Administrator) • National Territory`,
      stateName: 'Nigeria'
    };
  }

  // 1. Check user.state
  let rawState = (user.state || '').toUpperCase().replace(/^RT/, '').trim();
  
  if (!rawState || rawState === 'ALL' || rawState === 'FCT') {
    if (user.assigned_states && user.assigned_states.length > 0 && user.assigned_states[0] !== 'ALL') {
      rawState = user.assigned_states[0].toUpperCase().replace(/^RT/, '').trim();
    }
  }

  // 2. Robust name-based fallback matching if rawState is missing or defaulting to FCT
  const name = (user.full_name || user.username || '').toLowerCase();
  if (!rawState || rawState === 'FCT') {
    if (name.includes('ajayi') || name.includes('solomon') || name.includes('ellams') || name.includes('niger')) {
      rawState = 'NIGER';
    } else if (name.includes('kelechi') || name.includes('anambra')) {
      rawState = 'ANAMBRA';
    } else if (name.includes('kaduna') || name.includes('mukhtar')) {
      rawState = 'KADUNA';
    } else if (name.includes('kano') || name.includes('hassan') || name.includes('olaoti')) {
      rawState = 'KANO';
    } else if (name.includes('rivers') || name.includes('ajaegbu') || name.includes('daniel') || name.includes('jonas')) {
      rawState = 'RIVERS';
    } else if (name.includes('ogun')) {
      rawState = 'OGUN';
    } else if (name.includes('lagos')) {
      rawState = 'LAGOS';
    } else if (name.includes('imo')) {
      rawState = 'IMO';
    } else if (name.includes('enugu')) {
      rawState = 'ENUGU';
    } else if (name.includes('benue')) {
      rawState = 'BENUE';
    }
  }

  const stateCode = rawState || 'FCT';

  const stateNames = {
    'FCT': 'Federal Capital Territory',
    'NIGER': 'Niger State',
    'KADUNA': 'Kaduna State',
    'KANO': 'Kano State',
    'ANAMBRA': 'Anambra State',
    'LAGOS': 'Lagos State',
    'IMO': 'Imo State',
    'ENUGU': 'Enugu State',
    'RIVERS': 'Rivers State',
    'OGUN': 'Ogun State',
    'OYO': 'Oyo State',
    'BENUE': 'Benue State',
    'KEBBI': 'Kebbi State',
    'DELTA': 'Delta State',
    'EBONYI': 'Ebonyi State',
    'EDO': 'Edo State',
    'KOGI': 'Kogi State',
    'KWARA': 'Kwara State',
    'ONDO': 'Ondo State',
    'PLATEAU': 'Plateau State',
    'BAUCHI': 'Bauchi State',
    'BORNO': 'Borno State',
    'TARABA': 'Taraba State',
    'CROSS RIVER': 'Cross River State',
    'ABIA': 'Abia State',
  };

  const stateName = stateNames[stateCode] || `${stateCode} State`;
  const territoryName = stateCode === 'FCT' ? 'Federal Capital Territory' : `${stateName} Territory`;

  return {
    code: stateCode,
    dashboardTitle: `${stateCode} SDM DASHBOARD`,
    controlCenterTitle: `${stateCode} Telecom Operational Control Center`,
    subtitle: `State Delivery Manager - ${territoryName}`,
    intelligenceSubtitle: `AI-Powered Site Memory & Real-Time Incident Intelligence for ${stateName}`,
    regionText: `${territoryName}`,
    footerText: `${stateCode} SDM Dashboard v3.0 • Logged in as: ${user.full_name || user.username} (${user.role || 'State Delivery Manager'}) • ${territoryName}`,
    stateName: stateName
  };
}
