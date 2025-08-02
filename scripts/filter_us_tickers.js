const fs = require('fs');
const path = require('path');

function filterUSTickers() {
  const inputFile = path.join(__dirname, '..', 'all_tickers_with_data.txt');
  const outputFile = path.join(__dirname, '..', 'us_tickers_enhanced.txt');
  
  // Read the full data
  const lines = fs.readFileSync(inputFile, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  console.log(`Processing ${lines.length} total tickers...`);
  
  // Comprehensive list of country suffixes to exclude
  const countrySuffixes = [
    // Canada
    '.TO', '.V', '.CN', '.TSX',
    // Brazil
    '.SA', '.BVMF',
    // UK
    '.L', '.LN', '.LSE',
    // Switzerland
    '.SW', '.SWX',
    // Norway
    '.OL', '.OSE',
    // Hong Kong
    '.HK', '.HKG',
    // Japan
    '.T', '.TYO', '.JP',
    // Sweden
    '.ST', '.STO',
    // Spain
    '.MC', '.MCE',
    // Germany
    '.DE', '.F', '.ETR',
    // France
    '.PA', '.PAR',
    // Italy
    '.MI', '.MIL',
    // Netherlands
    '.AS', '.AMS',
    // Australia
    '.AX', '.ASX',
    // South Korea
    '.KS', '.KRX',
    // India
    '.NS', '.BO', '.NSE', '.BSE',
    // Singapore
    '.SI', '.SGX',
    // Mexico
    '.MX', '.BMV',
    // Argentina
    '.BA', '.BCBA',
    // Chile
    '.SN', '.BCS',
    // Peru
    '.LM', '.BVL',
    // Colombia
    '.CB', '.BVC',
    // Turkey
    '.IS', '.BIST',
    // Poland
    '.WA', '.GPW',
    // Czech Republic
    '.PR', '.PSE',
    // Hungary
    '.BD', '.BSE',
    // Russia
    '.ME', '.MOEX',
    // South Africa
    '.JO', '.JSE',
    // Egypt
    '.CA', '.EGX',
    // Israel
    '.TA', '.TASE',
    // Thailand
    '.BK', '.SET',
    // Malaysia
    '.KL', '.KLSE',
    // Philippines
    '.PS', '.PSE',
    // Indonesia
    '.JK', '.IDX',
    // Vietnam
    '.HM', '.HOSE',
    // Taiwan
    '.TW', '.TPE',
    // New Zealand
    '.NZ', '.NZX',
    // Finland
    '.HE', '.HEX',
    // Denmark
    '.CO', '.CSE',
    // Austria
    '.VI', '.WBAG',
    // Belgium
    '.BR', '.EBR',
    // Portugal
    '.LS', '.ELI',
    // Greece
    '.AT', '.ASE',
    // Ireland
    '.IR', '.ISEQ',
    // Luxembourg
    '.LU', '.LUXSE',
    // Iceland
    '.IC', '.ICEX',
    // Estonia
    '.TL', '.TSE',
    // Latvia
    '.RG', '.RSE',
    // Lithuania
    '.VS', '.VSE',
    // Slovenia
    '.LJ', '.LJSE',
    // Croatia
    '.ZG', '.ZSE',
    // Serbia
    '.BE', '.BELEX',
    // Bulgaria
    '.SO', '.BSE',
    // Romania
    '.BU', '.BVB',
    // Ukraine
    '.KX', '.PFTS',
    // Kazakhstan
    '.AL', '.KASE',
    // Uzbekistan
    '.TZ', '.UZSE',
    // Georgia
    '.TB', '.GSE',
    // Armenia
    '.AM', '.AMX',
    // Azerbaijan
    '.BA', '.BSE',
    // Kyrgyzstan
    '.KG', '.KSE',
    // Tajikistan
    '.TJ', '.TSE',
    // Turkmenistan
    '.TM', '.TSE',
    // Mongolia
    '.MN', '.MSE',
    // North Korea
    '.KP', '.KPSE',
    // Iran
    '.IR', '.TSE',
    // Iraq
    '.IQ', '.ISX',
    // Syria
    '.SY', '.DSE',
    // Lebanon
    '.LB', '.BSE',
    // Jordan
    '.JO', '.ASE',
    // Saudi Arabia
    '.SA', '.TASI',
    // UAE
    '.AE', '.DFM',
    // Qatar
    '.QA', '.QSE',
    // Kuwait
    '.KW', '.KSE',
    // Bahrain
    '.BH', '.BSE',
    // Oman
    '.OM', '.MSM',
    // Yemen
    '.YE', '.YSE',
    // Pakistan
    '.PK', '.KSE',
    // Afghanistan
    '.AF', '.KSE',
    // Bangladesh
    '.BD', '.DSE',
    // Sri Lanka
    '.LK', '.CSE',
    // Nepal
    '.NP', '.NEPSE',
    // Bhutan
    '.BT', '.BSE',
    // Maldives
    '.MV', '.MSE',
    // Myanmar
    '.MM', '.YSX',
    // Laos
    '.LA', '.LSX',
    // Cambodia
    '.KH', '.CSX',
    // Brunei
    '.BN', '.BSE',
    // East Timor
    '.TL', '.TSE',
    // Papua New Guinea
    '.PG', '.POMSOX',
    // Fiji
    '.FJ', '.SPSE',
    // Vanuatu
    '.VU', '.VSE',
    // Solomon Islands
    '.SB', '.SISE',
    // Samoa
    '.WS', '.SSE',
    // Tonga
    '.TO', '.TSE',
    // Kiribati
    '.KI', '.KSE',
    // Tuvalu
    '.TV', '.TSE',
    // Nauru
    '.NR', '.NSE',
    // Palau
    '.PW', '.PSE',
    // Marshall Islands
    '.MH', '.MSE',
    // Micronesia
    '.FM', '.FSE',
    // Northern Mariana Islands
    '.MP', '.MSE',
    // Guam
    '.GU', '.GSE',
    // American Samoa
    '.AS', '.ASE',
    // Puerto Rico
    '.PR', '.PSE',
    // US Virgin Islands
    '.VI', '.VSE',
    // Northern Mariana Islands
    '.MP', '.MSE',
    // Guam
    '.GU', '.GSE',
    // American Samoa
    '.AS', '.ASE',
    // Puerto Rico
    '.PR', '.PSE',
    // US Virgin Islands
    '.VI', '.VSE'
  ];
  
  // Filter for US tickers (no country suffixes)
  const usTickers = lines.filter(line => {
    const ticker = line.split('\t')[0];
    // US tickers typically don't have country suffixes
    return !countrySuffixes.some(suffix => ticker.includes(suffix));
  });
  
  console.log(`Found ${usTickers.length} US tickers`);
  
  // Write filtered data
  fs.writeFileSync(outputFile, usTickers.join('\n'));
  
  console.log(`Enhanced US tickers saved to: ${outputFile}`);
  
  // Show first 20 examples
  console.log('\nFirst 20 US tickers with company names:');
  usTickers.slice(0, 20).forEach((line, index) => {
    console.log(`${index + 1}: ${line}`);
  });
  
  // Show statistics
  const tickersOnly = usTickers.map(line => line.split('\t')[0]);
  const withCompanyNames = usTickers.filter(line => {
    const parts = line.split('\t');
    return parts.length > 1 && parts[1] !== 'Unknown';
  }).length;
  
  console.log(`\nStatistics:`);
  console.log(`- Total US tickers: ${usTickers.length}`);
  console.log(`- Tickers with company names: ${withCompanyNames}`);
  console.log(`- Tickers without company names: ${usTickers.length - withCompanyNames}`);
  
  // Show some examples of filtered out tickers
  const filteredOut = lines.filter(line => {
    const ticker = line.split('\t')[0];
    return countrySuffixes.some(suffix => ticker.includes(suffix));
  });
  
  console.log(`\nExamples of filtered out non-US tickers:`);
  filteredOut.slice(0, 10).forEach((line, index) => {
    console.log(`${index + 1}: ${line}`);
  });
  
  return usTickers;
}

// Run the filter
filterUSTickers(); 