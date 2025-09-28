// Variables globales
let ENRICHMENT_CSV_DATA = null;
let uploadedFiles = [];
let portfolioData = [];
let charts = {};
let currentAnalysis = null;

// Configuration des couleurs
const COLORS = {
    primary: '#667eea',
    secondary: '#764ba2',
    success: '#28a745',
    warning: '#ffc107',
    danger: '#dc3545',
    chartColors: [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
        '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF6384'
    ]
};

// Matrices de corrélation sectorielles globales
const CORRELATION_MATRIX = {
    'Technology': { 'Technology': 0.85, 'Healthcare': 0.3, 'Financial': 0.4, 'Energy': -0.1, 'Consumer Goods': 0.2, 'Industrial': 0.3, 'Materials': 0.2 },
    'Healthcare': { 'Technology': 0.3, 'Healthcare': 0.9, 'Financial': 0.2, 'Energy': 0.1, 'Consumer Goods': 0.3, 'Industrial': 0.2, 'Materials': 0.15 },
    'Financial': { 'Technology': 0.4, 'Healthcare': 0.2, 'Financial': 0.8, 'Energy': 0.3, 'Consumer Goods': 0.4, 'Industrial': 0.5, 'Materials': 0.4 },
    'Energy': { 'Technology': -0.1, 'Healthcare': 0.1, 'Financial': 0.3, 'Energy': 0.95, 'Consumer Goods': 0.2, 'Industrial': 0.4, 'Materials': 0.6 },
    'Consumer Goods': { 'Technology': 0.2, 'Healthcare': 0.3, 'Financial': 0.4, 'Energy': 0.2, 'Consumer Goods': 0.8, 'Industrial': 0.3, 'Materials': 0.25 },
    'Industrial': { 'Technology': 0.3, 'Healthcare': 0.2, 'Financial': 0.5, 'Energy': 0.4, 'Consumer Goods': 0.3, 'Industrial': 0.8, 'Materials': 0.5 },
    'Materials': { 'Technology': 0.2, 'Healthcare': 0.15, 'Financial': 0.4, 'Energy': 0.6, 'Consumer Goods': 0.25, 'Industrial': 0.5, 'Materials': 0.85 },
    'ETF': { 'Technology': 0.6, 'Healthcare': 0.5, 'Financial': 0.5, 'Energy': 0.4, 'Consumer Goods': 0.5, 'Industrial': 0.5, 'Materials': 0.4 }
};

// Seuils d'alerte adaptés à une diversification globale
const ALERTS = {
    CONCENTRATION: { threshold: 20, message: "Position trop concentrée", severity: "high" },
    SECTOR_BIAS: { threshold: 30, message: "Surexposition sectorielle", severity: "medium" },
    GEO_CONCENTRATION: { threshold: 45, message: "Concentration géographique excessive", severity: "medium" },
    LOW_DIVERSIFICATION: { threshold: 5, message: "Diversification insuffisante", severity: "high" },
    CORRELATION_RISK: { threshold: 0.7, message: "Risque de corrélation élevé", severity: "medium" }
};

async function loadEnrichmentCSV() {
    try {
        const response = await fetch('https://guillaume55.github.io/trade-republic-history-exporter/ui/enrichment.csv');
        if (!response.ok) {
            throw new Error('Fichier enrichment.csv non accessible depuis GitHub');
        }
        const csvText = await response.text();
        
        return new Promise((resolve, reject) => {
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                delimiter: ';',
                complete: function(results) {
                    const enrichmentData = {};
                    
                    results.data.forEach(row => {
                        const name = row.Asset_Name?.replace(/"/g, '').trim();
                        if (name && name !== '') {
                            enrichmentData[name] = {
                                sector: row.Sector || 'Other',
                                geography: row.Geography || 'Other',
                                risk: row.Risk_Level || 'Moyen',
                                esgScore: parseInt(row.ESG_Score) || 5,
                                liquidityScore: parseInt(row.Liquidity_Score) || 5,
                                volatility: parseInt(row.Volatility) || 5
                            };
                        }
                    });
                    
                    resolve(enrichmentData);
                },
                error: reject
            });
        });
    } catch (error) {
        console.error('Erreur lors du chargement du CSV d\'enrichissement:', error);
        throw error;
    }
}

async function loadEnrichmentFromFile(file) {
    try {
        const csvText = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
        
        return new Promise((resolve, reject) => {
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                delimiter: ';',
                complete: function(results) {
                    const enrichmentData = {};
                    
                    results.data.forEach(row => {
                        const name = row.Asset_Name?.replace(/"/g, '').trim();
                        if (name && name !== '') {
                            enrichmentData[name] = {
                                sector: row.Sector || 'Other',
                                geography: row.Geography || 'Other',
                                risk: row.Risk_Level || 'Moyen',
                                esgScore: parseInt(row.ESG_Score) || 5,
                                liquidityScore: parseInt(row.Liquidity_Score) || 5,
                                volatility: parseInt(row.Volatility) || 5
                            };
                        }
                    });
                    
                    resolve(enrichmentData);
                },
                error: reject
            });
        });
    } catch (error) {
        console.error('Erreur lors du chargement du fichier d\'enrichissement:', error);
        throw error;
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', async function() {
    try {
        ENRICHMENT_CSV_DATA = await loadEnrichmentCSV();
        showSuccess(`Données d'enrichissement chargées: ${Object.keys(ENRICHMENT_CSV_DATA).length} actifs`);
    } catch (error) {
        showError('Fichier enrichment.csv non accessible. Chargez-le via la dropzone pour une analyse complète.');
    }
    
    initializeDropzone();
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);
});

// Gestion de la dropzone
function initializeDropzone() {
    const dropzone = document.querySelector('.dropzone');
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, preventDefaults, false);
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, unhighlight, false);
    });
    
    dropzone.addEventListener('drop', handleDrop, false);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function highlight(e) {
    document.querySelector('.dropzone').classList.add('dragover');
}

function unhighlight(e) {
    document.querySelector('.dropzone').classList.remove('dragover');
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

function handleFileSelect(e) {
    handleFiles(e.target.files);
}

function handleFiles(files) {
    [...files].forEach(file => {
        if (file.name.toLowerCase().includes('enrichment') && file.name.endsWith('.csv')) {
            handleEnrichmentFile(file);
        } else if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
            uploadedFiles.push(file);
            displayUploadedFile(file);
        } else {
            showError('Seuls les fichiers CSV sont acceptés.');
        }
    });
    
    if (uploadedFiles.length > 0) {
        document.getElementById('uploadedFiles').style.display = 'block';
    }
}

async function handleEnrichmentFile(file) {
    try {
        ENRICHMENT_CSV_DATA = await loadEnrichmentFromFile(file);
        showSuccess(`Fichier d'enrichissement chargé: ${Object.keys(ENRICHMENT_CSV_DATA).length} actifs`);
    } catch (error) {
        showError(`Erreur lors du chargement de ${file.name}: ${error.message}`);
    }
}

function displayUploadedFile(file) {
    const filesList = document.getElementById('filesList');
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    fileItem.innerHTML = `
        <div class="file-info">
            <div class="file-icon">📄</div>
            <div class="file-details">
                <h4>${file.name}</h4>
                <p>${(file.size / 1024).toFixed(1)} KB</p>
            </div>
        </div>
        <div class="file-actions">
            <button class="btn btn-remove" onclick="removeFile('${file.name}')">Supprimer</button>
        </div>
    `;
    filesList.appendChild(fileItem);
}

function removeFile(fileName) {
    uploadedFiles = uploadedFiles.filter(file => file.name !== fileName);
    const filesList = document.getElementById('filesList');
    filesList.innerHTML = '';
    
    uploadedFiles.forEach(file => displayUploadedFile(file));
    
    if (uploadedFiles.length === 0) {
        document.getElementById('uploadedFiles').style.display = 'none';
    }
}

// Analyse des fichiers
async function analyzeAllFiles() {
    if (uploadedFiles.length === 0) {
        showError('Aucun fichier à analyser.');
        return;
    }

    showLoading();
    portfolioData = [];

    try {
        for (const file of uploadedFiles) {
            const data = await parseCSVFile(file);
            portfolioData = portfolioData.concat(data);
        }

        const analysis = analyzePortfolio(portfolioData);
        currentAnalysis = analysis;
        displayAnalysis(analysis);
        
        document.getElementById('analysisContainer').style.display = 'block';
        hideLoading();

    } catch (error) {
        console.error('Erreur lors de l\'analyse:', error);
        showError('Erreur lors de l\'analyse des fichiers.');
        hideLoading();
    }
}

function parseCSVFile(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            delimiter: ';', 
            complete: function(results) {
                resolve(results.data);
            },
            error: reject
        });
    });
}

function analyzePortfolio(data) {
    console.log('Analyse de', data.length, 'transactions');
    
    // Filtrer uniquement les achats avec valeurs négatives
    const purchases = data.filter(row => {
        const type = row.Type?.trim();
        const valeur = parseFloat(row.Valeur?.replace(',', '.') || 0);
        const nomTitre = row['Nom du titre']?.trim();
        
        const isAchat = type === 'Achat' || (type === 'Autre' && valeur < 0);
        
        return isAchat && 
               valeur < 0 && 
               nomTitre && 
               nomTitre !== 'Intérêts' &&
               nomTitre !== '';
    });

    // Regrouper par titre
    const positions = {};
    purchases.forEach(purchase => {
        const name = purchase['Nom du titre'].trim();
        const value = Math.abs(parseFloat(purchase.Valeur?.replace(',', '.') || 0));
        
        if (!positions[name]) {
            const enrichment = getEnrichmentData(name);
            positions[name] = {
                name: name,
                totalInvested: 0,
                transactions: 0,
                isin: purchase.ISIN || '',
                sector: enrichment.sector,
                geography: enrichment.geography,
                risk: enrichment.risk,
                esgScore: enrichment.esgScore,
                liquidityScore: enrichment.liquidityScore
            };
        }
        
        positions[name].totalInvested += value;
        positions[name].transactions += 1;
    });

        const positionsArray = Object.values(positions);
        const totalInvested = positionsArray.reduce((sum, pos) => sum + pos.totalInvested, 0);
        
        positionsArray.forEach(pos => {
        pos.percentage = totalInvested > 0 ? (pos.totalInvested / totalInvested) * 100 : 0;
    });



    positionsArray.sort((a, b) => b.totalInvested - a.totalInvested);

    const sectorAnalysis = analyzeBySector(positionsArray);
    const geoAnalysis = analyzeByGeography(positionsArray);
    const evolutionData = calculatePortfolioEvolution(data);

    const diversificationScore = calculateDiversificationScore(sectorAnalysis, geoAnalysis);
    const concentrationScore = calculateConcentrationScore(positionsArray);
    const correlationScore = calculateCorrelationScore(positionsArray, sectorAnalysis);
    const esgScore = calculatePortfolioESGScore(positionsArray);
    const liquidityScore = calculatePortfolioLiquidityScore(positionsArray);
    const stressTestScore = calculateStressTestScore(positionsArray, sectorAnalysis);
    
    const alerts = generateAlerts(positionsArray, sectorAnalysis, geoAnalysis);
    const recommendations = generateRecommendations(sectorAnalysis, geoAnalysis, positionsArray);

    return {
        positions: positionsArray,
        totalInvested,
        totalPositions: positionsArray.length,
        sectorAnalysis,
        evolutionData,
        geoAnalysis,
        diversificationScore,
        concentrationScore,
        correlationScore,
        esgScore,
        liquidityScore,
        stressTestScore,
        topPositions: positionsArray.filter(p => p.isin !== '').slice(0, 5),
        alerts,
        recommendations
    };
}

function getEnrichmentData(name) {
    if (ENRICHMENT_CSV_DATA && ENRICHMENT_CSV_DATA[name]) {
        return ENRICHMENT_CSV_DATA[name];
    }
    
    return {
        sector: 'Other',
        geography: 'Other',
        risk: 'Inconnu',
        esgScore: null,
        liquidityScore: null
    };
}

function calculateDiversificationScore(sectorAnalysis, geoAnalysis) {
    const sectors = sectorAnalysis.length;
    const maxSectorWeight = Math.max(...sectorAnalysis.map(s => s.percentage));
    const maxGeoWeight = Math.max(...geoAnalysis.map(g => g.percentage));
    
    let sectorScore = 10;
    let geoScore = 10;
    
    // Score sectoriel 
    if (maxSectorWeight > 50) sectorScore = 1;
    else if (maxSectorWeight > 40) sectorScore = 3;
    else if (maxSectorWeight > 30) sectorScore = 5;
    else if (maxSectorWeight > 25) sectorScore = 6;
    else if (sectors < 4) sectorScore = 3;
    else if (sectors < 6) sectorScore = 6;
    else if (sectors >= 8) sectorScore = 9;
    
    // Score géographique
    const hhi = geoAnalysis.reduce((sum, geo) => sum + Math.pow(geo.percentage, 2), 0);
    
    if (hhi > 4000) geoScore = 1;
    else if (hhi > 3000) geoScore = 3;
    else if (hhi > 2000) geoScore = 6;
    else if (maxGeoWeight > 50) geoScore = 4;
    else if (geoAnalysis.length >= 6 && maxGeoWeight < 30) geoScore = 10;
    else if (geoAnalysis.length >= 4) geoScore = 8;
    
    return Math.round((sectorScore + geoScore) / 2);
}

function calculateConcentrationScore(positions) {
    const maxPosition = Math.max(...positions.map(p => p.percentage));
    const top3Weight = positions.slice(0, 3).reduce((sum, p) => sum + p.percentage, 0);
    
    let score = 10;
    
    if (maxPosition > 30) score = 1;
    else if (maxPosition > 25) score = 3;
    else if (maxPosition > 20) score = 5;
    else if (maxPosition > 15) score = 7;
    else if (maxPosition > 10) score = 8;
    
    if (top3Weight > 60) score = Math.min(score, 3);
    
    return Math.max(1, score);
}

function calculateCorrelationScore(positions, sectorAnalysis) {
    let weightedCorrelation = 0;
    let totalWeight = 0;
    
    for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
            const corr = getCorrelation(positions[i].sector, positions[j].sector);
            const weight = (positions[i].percentage * positions[j].percentage) / 10000;
            weightedCorrelation += corr * weight;
            totalWeight += weight;
        }
    }
    
    const avgCorrelation = totalWeight > 0 ? weightedCorrelation / totalWeight : 0;
    return Math.max(1, Math.round(10 - (avgCorrelation * 12)));
}

function calculatePortfolioESGScore(positions) {
    const validPositions = positions.filter(pos => pos.esgScore !== null);
    if (validPositions.length === 0) return null;
    
    const weightedESG = validPositions.reduce((sum, pos) => {
        return sum + (pos.esgScore * pos.percentage / 100);
    }, 0);
    
    return Math.round(weightedESG);
}

function calculatePortfolioLiquidityScore(positions) {
    const validPositions = positions.filter(pos => pos.liquidityScore !== null);
    if (validPositions.length === 0) return null;
    
    const weightedLiquidity = validPositions.reduce((sum, pos) => {
        return sum + (pos.liquidityScore * pos.percentage / 100);
    }, 0);
    
    return Math.round(weightedLiquidity);
}

function calculateStressTestScore(positions, sectorAnalysis) {
    const scenarios = {
        'techCrash': { 'Technology': -35, 'Healthcare': -8, 'Energy': +3, 'Financial': -20, 'ETF': -25 },
        'recession': { 'Technology': -25, 'Consumer Goods': -30, 'Healthcare': -5, 'Energy': -15, 'Financial': -35 },
        'inflation': { 'Bonds': -25, 'Commodities': +20, 'Energy': +15, 'Technology': -10, 'Financial': -5 }
    };
    
    let worstScenario = 0;
    Object.values(scenarios).forEach(scenario => {
        const scenarioLoss = sectorAnalysis.reduce((loss, sector) => {
            const sectorImpact = scenario[sector.sector] || -12;
            return loss + (sector.percentage * sectorImpact / 100);
        }, 0);
        worstScenario = Math.min(worstScenario, scenarioLoss);
    });
    
    return Math.max(1, Math.round(10 + (worstScenario / 4)));
}

function getCorrelation(sector1, sector2) {
    if (!CORRELATION_MATRIX[sector1] || !CORRELATION_MATRIX[sector2]) return 0.5;
    return CORRELATION_MATRIX[sector1][sector2] || CORRELATION_MATRIX[sector2][sector1] || 0.5;
}

function analyzeBySector(positions) {
    if (positions.length === 0) return [];
    
    const sectors = {};
    const totalInvested = positions.reduce((sum, p) => sum + p.totalInvested, 0);
    
    positions.forEach(pos => {
        if (!sectors[pos.sector]) {
            sectors[pos.sector] = { value: 0, count: 0 };
        }
        sectors[pos.sector].value += pos.totalInvested;
        sectors[pos.sector].count += 1;
    });

    return Object.entries(sectors)
        .map(([sector, data]) => ({
            sector,
            value: data.value,
            count: data.count,
            percentage: totalInvested > 0 ? (data.value / totalInvested) * 100 : 0
        }))
        .sort((a, b) => b.value - a.value);
}

function analyzeByGeography(positions) {
    if (positions.length === 0) return [];
    
    const geographies = {};
    const totalInvested = positions.reduce((sum, p) => sum + p.totalInvested, 0);
    
    positions.forEach(pos => {
        if (!geographies[pos.geography]) {
            geographies[pos.geography] = { value: 0, count: 0 };
        }
        geographies[pos.geography].value += pos.totalInvested;
        geographies[pos.geography].count += 1;
    });

    return Object.entries(geographies)
        .map(([geography, data]) => ({
            geography,
            value: data.value,
            count: data.count,
            percentage: totalInvested > 0 ? (data.value / totalInvested) * 100 : 0
        }))
        .sort((a, b) => b.value - a.value);
}

function generateAlerts(positions, sectorAnalysis, geoAnalysis) {
    const alerts = [];
    
    // Alertes de concentration
    positions.filter(pos => pos.percentage > ALERTS.CONCENTRATION.threshold)
        .forEach(pos => {
            alerts.push({
                message: ALERTS.CONCENTRATION.message,
                severity: ALERTS.CONCENTRATION.severity,
                detail: `${pos.name}: ${pos.percentage.toFixed(1)}%`
            });
        });
    
    // Alertes sectorielles
    sectorAnalysis.filter(sector => sector.percentage > ALERTS.SECTOR_BIAS.threshold)
        .forEach(sector => {
            alerts.push({
                message: ALERTS.SECTOR_BIAS.message,
                severity: ALERTS.SECTOR_BIAS.severity,
                detail: `${sector.sector}: ${sector.percentage.toFixed(1)}%`
            });
        });
    
    // Alertes géographiques
    geoAnalysis.filter(geo => geo.percentage > ALERTS.GEO_CONCENTRATION.threshold)
        .forEach(geo => {
            alerts.push({
                message: ALERTS.GEO_CONCENTRATION.message,
                severity: ALERTS.GEO_CONCENTRATION.severity,
                detail: `${geo.geography}: ${geo.percentage.toFixed(1)}%`
            });
        });
    
    // Diversification insuffisante
    if (sectorAnalysis.length < ALERTS.LOW_DIVERSIFICATION.threshold) {
        alerts.push({
            message: ALERTS.LOW_DIVERSIFICATION.message,
            severity: ALERTS.LOW_DIVERSIFICATION.severity,
            detail: `Seulement ${sectorAnalysis.length} secteurs`
        });
    }
    
    return alerts;
}

function calculatePortfolioEvolution(transactions) {
    const sortedTx = transactions.sort((a, b) => new Date(a.Date) - new Date(b.Date));
    
    const monthlyData = {};
    
    sortedTx.forEach(tx => {
        const date = new Date(tx.Date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = {
                invested: 0,
                dividends: 0,
                deposits: 0,
                withdrawals: 0
            };
        }
        
        const value = parseFloat(tx.Valeur?.replace(',', '.') || 0);
        
        switch (tx.Type?.trim()) {
            case 'Achat':
            case 'Autre':
                if (value < 0) {
                    monthlyData[monthKey].invested += Math.abs(value);
                }
                break;
            case 'Dividendes':
            case 'Intérêts':
                if (value > 0) {
                    monthlyData[monthKey].dividends += value;
                }
                break;
            case 'Dépôt':
                if (value > 0) {
                    monthlyData[monthKey].deposits += value;
                }
                break;
            case 'Retrait':
                if (value < 0) {
                    monthlyData[monthKey].withdrawals += Math.abs(value);
                }
                break;
        }
    });
    
    const evolutionData = [];
    const months = Object.keys(monthlyData).sort();
    let cumulativeValue = 0;
    const monthlyReturn = 0.008; // 0.8% par mois
    
    months.forEach((month, index) => {
        const data = monthlyData[month];
        
        if (index > 0) {
            cumulativeValue *= (1 + monthlyReturn);
        }
        
        cumulativeValue += data.invested + data.deposits + data.dividends - data.withdrawals;
        
        evolutionData.push({
            month: month,
            date: new Date(month + '-01'),
            value: cumulativeValue,
            invested: data.invested,
            dividends: data.dividends,
            deposits: data.deposits,
            withdrawals: data.withdrawals
        });
    });
    
    return evolutionData;
}

function generateRecommendations(sectorAnalysis, geoAnalysis, positions) {
    const recommendations = [];
    
    const maxGeo = geoAnalysis[0];
    const maxSector = sectorAnalysis[0];
    const maxPosition = Math.max(...positions.map(p => p.percentage));
    
    if (maxGeo && maxGeo.percentage > 50) {
        recommendations.push({
            type: "REBALANCING",
            priority: "HIGH",
            action: `Réduire exposition ${maxGeo.geography}`,
            suggestion: "Diversifier géographiquement",
            target: `Objectif: < 45% (actuellement ${maxGeo.percentage.toFixed(1)}%)`
        });
    }
    
    if (maxSector && maxSector.percentage > 35) {
        recommendations.push({
            type: "DIVERSIFICATION",
            priority: "MEDIUM",
            action: `Réduire exposition ${maxSector.sector}`,
            suggestion: "Renforcer autres secteurs",
            target: `Objectif: < 30% (actuellement ${maxSector.percentage.toFixed(1)}%)`
        });
    }
    
    if (maxPosition > 20) {
        const topPosition = positions.find(p => p.percentage === maxPosition);
        recommendations.push({
            type: "RISK_MANAGEMENT",
            priority: "HIGH",
            action: "Réduire concentration",
            suggestion: `Diminuer ${topPosition.name}`,
            target: `Objectif: < 15% par position (actuellement ${maxPosition.toFixed(1)}%)`
        });
    }
    
    if (sectorAnalysis.length < 6) {
        recommendations.push({
            type: "DIVERSIFICATION",
            priority: "HIGH", 
            action: "Augmenter diversification sectorielle",
            suggestion: "Ajouter nouveaux secteurs",
            target: `Objectif: 8+ secteurs (actuellement ${sectorAnalysis.length})`
        });
    }
    
    return recommendations;
}

function displayAnalysis(analysis) {
    console.log("Analysis", analysis);
    updateRiskCard('diversification', analysis.diversificationScore, getDiversificationDescription(analysis.diversificationScore));
    updateRiskCard('concentration', analysis.concentrationScore, getConcentrationDescription(analysis.concentrationScore));
    updateRiskCard('volatility', analysis.stressTestScore, getStressDescription(analysis.stressTestScore));
    updateRiskCard('performance', analysis.correlationScore, getCorrelationDescription(analysis.correlationScore));

    document.getElementById('totalValue').textContent =
        analysis.totalInvested > 2000 ? (analysis.totalInvested/1000).toFixed(2) + ' k€': analysis.totalInvested.toFixed(2) + ' €';
    
    document.getElementById('totalPositions').textContent =
        analysis.totalPositions;

    document.getElementById('esg').textContent =
        analysis.esgScore + "/10";


    if (analysis.sectorAnalysis.length > 0) {
        createSectorChart(analysis.sectorAnalysis);
    }
    if (analysis.geoAnalysis.length > 0) {
        createGeographyChart(analysis.geoAnalysis);
    }
    if (analysis.topPositions.length > 0) {
        createTopPositionsChart(analysis.topPositions);
    }
    
    createEvolutionChart(analysis.evolutionData);
    updatePositionsTable(analysis.positions);
    displayAlerts(analysis.alerts);
    displayRecommendations(analysis.recommendations);
}

function getDiversificationDescription(score) {
    if (score >= 8) return "Excellente diversification";
    if (score >= 6) return "Diversification satisfaisante";
    if (score >= 4) return "Diversification à améliorer";
    return "Diversification insuffisante";
}

function getConcentrationDescription(score) {
    if (score >= 8) return "Bien équilibré";
    if (score >= 6) return "Concentration modérée";
    if (score >= 4) return "Concentration élevée";
    return "Très concentré";
}

function getStressDescription(score) {
    if (score >= 9) return "Très résilient";
    if (score >= 7) return "Résilience élevée";
    if (score >= 5) return "Résilience modérée";
    return "Faible résilience";
}

function getCorrelationDescription(score) {
    if (score >= 8) return "Faible corrélation";
    if (score >= 6) return "Corrélation modérée";
    if (score >= 4) return "Corrélation élevée";
    return "Très corrélé";
}

function updateRiskCard(type, score, description) {
    const card = document.getElementById(`${type}Card`);
    const scoreElement = document.getElementById(`${type}Score`);
    const descElement = document.getElementById(`${type}Desc`);
    
    if (!card || !scoreElement || !descElement) return;
    
    scoreElement.textContent = score;
    descElement.textContent = description;
    
    card.className = 'risk-card';
    if (score >= 8) {
        card.classList.add('risk-low');
    } else if (score >= 6) {
        card.classList.add('risk-medium');
    } else {
        card.classList.add('risk-high');
    }
}

function createSectorChart(sectorData) {
    const ctx = document.getElementById('sectorChart');
    if (!ctx) return;
    
    if (charts.sector) {
        charts.sector.destroy();
    }
    
    charts.sector = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: sectorData.map(s => s.sector),
            datasets: [{
                data: sectorData.map(s => s.percentage),
                backgroundColor: COLORS.chartColors.slice(0, sectorData.length),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.label + ': ' + context.parsed.toFixed(1) + '%';
                        }
                    }
                }
            }
        }
    });
}

function createGeographyChart(geoData) {
    const ctx = document.getElementById('geoChart');
    if (!ctx) return;
    
    if (charts.geography) {
        charts.geography.destroy();
    }
    
    charts.geography = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: geoData.map(g => g.geography),
            datasets: [{
                data: geoData.map(g => g.percentage),
                backgroundColor: COLORS.chartColors.slice(0, geoData.length),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.label + ': ' + context.parsed.toFixed(1) + '%';
                        }
                    }
                }
            }
        }
    });
}

function createTopPositionsChart(topPositions) {
    const ctx = document.getElementById('topPositionsChart');
    if (!ctx) return;
    
    if (charts.topPositions) {
        charts.topPositions.destroy();
    }
    
    charts.topPositions = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: topPositions.map(p => p.name.length > 20 ? p.name.substring(0, 20) + '...' : p.name),
            datasets: [{
                data: topPositions.map(p => p.totalInvested),
                backgroundColor: COLORS.primary,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.parsed.x.toFixed(0) + '€';
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true
                }
            }
        }
    });
}

function createEvolutionChart(evolutionData) {
    const ctx = document.getElementById('evolutionChart');
    if (!ctx || !evolutionData || evolutionData.length === 0) return;
    
    if (charts.evolution) {
        charts.evolution.destroy();
    }
    
    const labels = evolutionData.map(d => {
        const date = d.date || new Date(d.month + '-01');
        return date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
    });
    
    const portfolioValues = evolutionData.map(d => d.value);
    const investedValues = evolutionData.map((d, index) => {
        let cumulative = 0;
        for (let i = 0; i <= index; i++) {
            const data = evolutionData[i];
            cumulative += data.invested + data.deposits + data.dividends - data.withdrawals;
        }
        return cumulative;
    });
    
    charts.evolution = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Valeur avec intérêts composés (€)',
                    data: portfolioValues,
                    borderColor: COLORS.primary,
                    backgroundColor: COLORS.primary + '20',
                    fill: false,
                    tension: 0.4,
                    borderWidth: 3
                },
                {
                    label: 'Capital investi (€)',
                    data: investedValues,
                    borderColor: COLORS.secondary,
                    backgroundColor: COLORS.secondary + '20',
                    fill: false,
                    tension: 0.4,
                    borderWidth: 2,
                    borderDash: [5, 5]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: 'Valeur (€)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Période'
                    }
                }
            },
            plugins: {
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        afterBody: function(tooltipItems) {
                            const index = tooltipItems[0].dataIndex;
                            const data = evolutionData[index];
                            const gain = data.value - investedValues[index];
                            const gainPercent = investedValues[index] > 0 ? ((gain / investedValues[index]) * 100) : 0;
                            
                            return [
                                `Plus-value: ${gain.toFixed(0)}€`,
                                `Performance: ${gainPercent.toFixed(1)}%`,
                                `Investi ce mois: ${data.invested.toFixed(0)}€`,
                                `Dividendes: ${data.dividends.toFixed(0)}€`
                            ];
                        }
                    }
                },
                legend: {
                    position: 'top'
                },
                title: {
                    display: true,
                    text: 'Évolution du Portfolio (Simulation 10% annuel)'
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

function updatePositionsTable(positions) {
    const tbody = document.querySelector('#positionsTable tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (positions.length === 0) {
        const row = tbody.insertRow();
        row.innerHTML = '<td colspan="8">Aucune position trouvée</td>';
        return;
    }
    
    positions.forEach(position => {
        const row = tbody.insertRow();

        if( position.isin !== '')
        {
            const enriched = position.sector !== 'Other' || position.geography !== 'Other';
            const nameCell = position.name.length > 30 ? position.name.substring(0, 30) + '...' : position.name;
            const sectorDisplay = enriched ? position.sector : 'Non enrichi';
            const geoDisplay = enriched ? position.geography : 'Non enrichi';
            const riskDisplay = position.risk !== 'Inconnu' ? position.risk : 'Non enrichi';
            
            row.innerHTML = `
                <td title="${position.name}">${nameCell}</td>
                <td><span class="sector-badge ${enriched ? '' : 'not-enriched'}">${sectorDisplay}</span></td>
                <td><span class="geo-badge ${enriched ? '' : 'not-enriched'}">${geoDisplay}</span></td>
                <td><strong>${position.totalInvested.toFixed(2)}€</strong></td>
                <td><strong>${position.percentage.toFixed(1)}%</strong></td>
                <td><span class="risk-badge ${position.risk !== 'Inconnu' ? 'risk-' + position.risk.toLowerCase().replace(' ', '-') : 'not-enriched'}">${riskDisplay}</span></td>
                <td>${position.esgScore !== null ? position.esgScore + '/10' : '-'}</td>
                <td>${position.transactions}</td>
            `;
        }
    });
}

function displayAlerts(alerts) {
    const existingContainer = document.querySelector('.alerts-container');
    if (existingContainer) {
        existingContainer.remove();
    }
    
    const container = document.createElement('div');
    container.className = 'alerts-container';
    container.innerHTML = '<h3>Alertes Détectées</h3>';
    
    if (alerts.length === 0) {
        container.innerHTML += '<p class="no-alerts">Aucune alerte critique détectée</p>';
    } else {
        alerts.forEach(alert => {
            const alertDiv = document.createElement('div');
            alertDiv.className = `alert alert-${alert.severity}`;
            alertDiv.innerHTML = `
                <div class="alert-message">${alert.message}</div>
                <div class="alert-detail">${alert.detail}</div>
            `;
            container.appendChild(alertDiv);
        });
    }
    
    const riskOverview = document.querySelector('.risk-overview');
    if (riskOverview && riskOverview.parentNode) {
        if (riskOverview.nextSibling) {
            riskOverview.parentNode.insertBefore(container, riskOverview.nextSibling);
        } else {
            riskOverview.parentNode.appendChild(container);
        }
    }
}

function displayRecommendations(recommendations) {
    const existingContainer = document.querySelector('.recommendations-container');
    if (existingContainer) {
        existingContainer.remove();
    }
    
    const container = document.createElement('div');
    container.className = 'recommendations-container';
    container.innerHTML = '<h3>Recommandations</h3>';
    
    if (recommendations.length === 0) {
        container.innerHTML += '<p class="no-recommendations">Portfolio bien équilibré, aucune recommandation majeure</p>';
    } else {
        recommendations.forEach(rec => {
            const recDiv = document.createElement('div');
            recDiv.className = `recommendation recommendation-${rec.priority.toLowerCase()}`;
            recDiv.innerHTML = `
                <div class="rec-header">
                    <span class="rec-type">${rec.type}</span>
                    <span class="rec-priority priority-${rec.priority.toLowerCase()}">${rec.priority}</span>
                </div>
                <div class="rec-action">${rec.action}</div>
                <div class="rec-suggestion">${rec.suggestion}</div>
                <div class="rec-target">${rec.target}</div>
            `;
            container.appendChild(recDiv);
        });
    }
    
    const alertsContainer = document.querySelector('.alerts-container');
    const statsGrid = document.querySelector('.stats-grid');
    const insertAfter = alertsContainer || statsGrid;
    
    if (insertAfter && insertAfter.parentNode) {
        if (insertAfter.nextSibling) {
            insertAfter.parentNode.insertBefore(container, insertAfter.nextSibling);
        } else {
            insertAfter.parentNode.appendChild(container);
        }
    }
}

// Fonctions utilitaires
function showLoading() {
    const existing = document.getElementById('loadingIndicator');
    if (existing) existing.remove();
    
    const loading = document.createElement('div');
    loading.id = 'loadingIndicator';
    loading.className = 'loading-indicator';
    loading.innerHTML = `
        <div class="spinner"></div>
        <p>Analyse en cours...</p>
    `;
    document.body.appendChild(loading);
}

function hideLoading() {
    const loading = document.getElementById('loadingIndicator');
    if (loading) {
        loading.remove();
    }
}

function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.innerHTML = `
        <strong>Succès:</strong> ${message}
        <button onclick="this.parentElement.remove()" style="float: right;">×</button>
    `;
    
    const container = document.querySelector('.dropzone-container');
    if (container) {
        container.insertBefore(successDiv, container.firstChild);
        
        setTimeout(() => {
            if (successDiv.parentNode) {
                successDiv.remove();
            }
        }, 8000);
    }
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <strong>Erreur:</strong> ${message}
        <button onclick="this.parentElement.remove()" style="float: right;">×</button>
    `;
    
    const container = document.querySelector('.dropzone-container');
    if (container) {
        container.insertBefore(errorDiv, container.firstChild);
        
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 8000);
    }
}