import React, { useState, useEffect, useRef } from 'react';
import { Upload, Database, BarChart3, MessageSquare, Brain, Download, Trash2, LogOut, TrendingUp, PieChart, Activity, User, Lock, Mail, AlertTriangle, Eye, FileText, Grid, Layers, Zap } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Cell, PieChart as RePieChart, Pie } from 'recharts';
import Papa from 'papaparse';

// Alert Component (Unchanged)
const AlertMessage = ({ message, type, onClose }) => {
    if (!message) return null;
    const colorClasses = {
        error: 'bg-red-600/50 border-red-500',
        success: 'bg-emerald-600/50 border-emerald-500',
        info: 'bg-cyan-600/50 border-cyan-500',
        warning: 'bg-yellow-600/50 border-yellow-500',
    };
    const Icon = type === 'error' ? AlertTriangle : (type === 'success' ? Brain : Activity);

    return (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-xl text-white flex items-center gap-3 border ${colorClasses[type] || colorClasses.info}`}>
            <Icon className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">{message}</p>
            <button onClick={onClose} className="ml-4 p-1 rounded-full hover:bg-white/20 transition">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
};

export default function DataMind() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authMode, setAuthMode] = useState('login');
    const [currentUser, setCurrentUser] = useState(null);
    const [authForm, setAuthForm] = useState({ email: '', password: '', name: '' });
    const [notification, setNotification] = useState({ message: '', type: '' });
    
    const [datasets, setDatasets] = useState([]);
    const [activeDataset, setActiveDataset] = useState(null);
    const [view, setView] = useState('manager');
    // [IMPROVEMENT] Add 'correlation' and 'bivariate' tabs
    const [explorerTab, setExplorerTab] = useState('univariate'); 
    
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [insights, setInsights] = useState([]);
    const [stats, setStats] = useState(null);
    const [correlations, setCorrelations] = useState([]);
    const [distributions, setDistributions] = useState({});
    const [categoricalDists, setCategoricalDists] = useState({});
    const [bivariateData, setBivariateData] = useState({});
    // [IMPROVEMENT] Add state for analysis status
    const [isAnalyzing, setIsAnalyzing] = useState(false); 

    const chatEndRef = useRef(null);
    const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    useEffect(() => {
        const savedUser = localStorage.getItem('datamind_current_user');
        if (savedUser) {
            try {
                const user = JSON.parse(savedUser);
                setCurrentUser(user);
                setIsAuthenticated(true);
                loadUserData(user.email);
            } catch (e) {
                localStorage.removeItem('datamind_current_user'); 
            }
        }
    }, []);

    const loadUserData = (email) => {
        const userDataKey = `datamind_${email}_data`;
        try {
            const saved = JSON.parse(localStorage.getItem(userDataKey) || '[]');
            setDatasets(saved);
            if (activeDataset && !saved.find(d => d.id === activeDataset.id)) {
                setActiveDataset(null);
            }
        } catch (e) {
            setDatasets([]);
        }
    };

    const saveUserData = (data) => {
        if (currentUser) {
            const userDataKey = `datamind_${currentUser.email}_data`;
            localStorage.setItem(userDataKey, JSON.stringify(data));
            setDatasets(data);
        }
    };

    const showNotification = (message, type = 'info') => {
        setNotification({ message, type });
        setTimeout(() => setNotification({ message: '', type: '' }), 5000);
    };

    // Auth Handlers (Unchanged)
    const handleAuth = (e) => {
        e.preventDefault();
        const users = JSON.parse(localStorage.getItem('datamind_users') || '[]');
        
        if (authMode === 'register') {
            if (!authForm.name || !authForm.email || !authForm.password) {
                showNotification('All fields are required for registration.', 'error');
                return;
            }
            if (users.find(u => u.email === authForm.email)) {
                showNotification('Email already registered! Please use a different email or sign in.', 'error');
                return;
            }
            const newUser = { name: authForm.name, email: authForm.email, password: authForm.password, id: Date.now() };
            users.push(newUser);
            localStorage.setItem('datamind_users', JSON.stringify(users));
            localStorage.setItem('datamind_current_user', JSON.stringify(newUser));
            setCurrentUser(newUser);
            setIsAuthenticated(true);
            loadUserData(newUser.email);
            setAuthForm({ email: '', password: '', name: '' });
            showNotification('Registration successful! Welcome to DataMind.', 'success');
        } else {
            const user = users.find(u => u.email === authForm.email && u.password === authForm.password);
            if (user) {
                localStorage.setItem('datamind_current_user', JSON.stringify(user));
                setCurrentUser(user);
                setIsAuthenticated(true);
                loadUserData(user.email);
                setAuthForm({ email: '', password: '', name: '' });
                showNotification(`Welcome back, ${user.name}!`, 'success');
            } else {
                showNotification('Invalid email or password. Please try again.', 'error');
            }
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('datamind_current_user');
        setCurrentUser(null);
        setIsAuthenticated(false);
        setDatasets([]);
        setActiveDataset(null);
        setView('manager');
        setChatMessages([]);
        setInsights([]);
        setStats(null);
        showNotification('You have been signed out.', 'info');
    };

    // File Upload Handler (Updated to include isAnalyzing)
    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        showNotification('Parsing file and analyzing data...', 'info');
        setIsAnalyzing(true);

        const reader = new FileReader();
        reader.onload = (event) => {
            Papa.parse(event.target.result, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                complete: (result) => {
                    setIsAnalyzing(false);
                    if (result.data && result.data.length > 0) {
                        const newDataset = {
                            id: Date.now(),
                            name: file.name,
                            data: result.data,
                            columns: Object.keys(result.data[0] || {}),
                            uploadedAt: new Date().toISOString()
                        };
                        const updated = [...datasets, newDataset];
                        saveUserData(updated);
                        setActiveDataset(newDataset);
                        setView('explorer');
                        analyzeDataset(newDataset);
                        showNotification(`Dataset "${newDataset.name}" uploaded and analyzed!`, 'success');
                    } else {
                        showNotification('No data found in file. Please upload a valid CSV.', 'error');
                    }
                },
                error: (error) => {
                    setIsAnalyzing(false);
                    showNotification('Error parsing file: ' + error.message, 'error');
                }
            });
        };
        reader.readAsText(file);
    };

    // [IMPROVEMENT] Enhanced Analysis Functions and Logic
    const calculateCorrelation = (data, col1, col2) => {
        const pairs = data.map(row => [row[col1], row[col2]]).filter(([a, b]) => 
            typeof a === 'number' && typeof b === 'number' && !isNaN(a) && !isNaN(b)
        );
        if (pairs.length < 2) return 0;
        const mean1 = pairs.reduce((sum, [a]) => sum + a, 0) / pairs.length;
        const mean2 = pairs.reduce((sum, [, b]) => sum + b, 0) / pairs.length;
        let num = 0, den1 = 0, den2 = 0;
        pairs.forEach(([a, b]) => {
            const diff1 = a - mean1;
            const diff2 = b - mean2;
            num += diff1 * diff2;
            den1 += diff1 * diff1;
            den2 += diff2 * diff2;
        });
        return num / Math.sqrt(den1 * den2) || 0;
    };

    const createHistogram = (values, bins = 15) => {
        const sorted = [...values].sort((a, b) => a - b);
        if (sorted.length === 0) return [];
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        if (min === max) return [{ range: `${min}`, count: sorted.length, rangeStart: min }];
        
        const binSize = (max - min) / bins;
        const histogram = Array(bins).fill(0).map((_, i) => ({
            range: `${(min + i * binSize).toFixed(0)}-${(min + (i + 1) * binSize).toFixed(0)}`,
            count: 0,
            rangeStart: min + i * binSize
        }));
        
        values.forEach(v => {
            const binIndex = Math.min(Math.floor((v - min) / binSize), bins - 1);
            histogram[binIndex].count++;
        });
        
        return histogram;
    };

    const analyzeDataset = (dataset) => {
        if (!dataset || !dataset.data || dataset.data.length === 0) return;

        const cols = dataset.columns;
        const data = dataset.data;
        const newStats = {};
        const newInsights = [];
        const newDistributions = {};
        const newCategoricalDists = {};
        const newBivariateData = {};
        const recordCount = data.length;

        // Univariate Analysis
        cols.forEach(col => {
            const values = data.map(row => row[col]).filter(v => v != null);
            const numericValues = values.filter(v => typeof v === 'number' && !isNaN(v));
            
            if (numericValues.length > 0) {
                const sorted = [...numericValues].sort((a, b) => a - b);
                const sum = numericValues.reduce((a, b) => a + b, 0);
                const mean = sum / numericValues.length;
                
                // Calculate Median
                const mid = Math.floor(sorted.length / 2);
                const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
                
                const min = sorted[0];
                const max = sorted[sorted.length - 1];
                const q1 = sorted[Math.floor(sorted.length * 0.25)];
                const q3 = sorted[Math.floor(sorted.length * 0.75)];
                const std = Math.sqrt(numericValues.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / numericValues.length);
                
                // [IMPROVEMENT] Calculate Coefficient of Variation (CV) - Code Cell 14 logic
                const cv = (std / mean) * 100;

                newStats[col] = {
                    type: 'numeric',
                    mean: mean.toFixed(2),
                    median: median.toFixed(2),
                    min: min.toFixed(2),
                    max: max.toFixed(2),
                    q1: q1.toFixed(2),
                    q3: q3.toFixed(2),
                    std: std.toFixed(2),
                    cv: cv.toFixed(2), // CV included in stats
                    missing: ((recordCount - values.length) / recordCount * 100).toFixed(1) + '%',
                };

                newDistributions[col] = createHistogram(numericValues, 15);

                if (Math.abs(mean - median) / std > 0.5 && numericValues.length > 30) {
                    newInsights.push({
                        agent: 'Analyst',
                        text: `Potential **skewness** detected in **${col}** (Mean: ${mean.toFixed(0)}, Median: ${median.toFixed(0)}).`,
                        type: 'warning'
                    });
                }
                if (max > mean + 3 * std) {
                    newInsights.push({
                        agent: 'Analyst',
                        text: `High outlier/max value detected in **${col}** (Max: ${max.toFixed(0)}). This may represent a **premium segment** or extreme case.`,
                        type: 'warning'
                    });
                }

            } else {
                // Categorical Analysis
                const unique = [...new Set(values)];
                const categoryCounts = {};
                values.forEach(v => {
                    categoryCounts[v] = (categoryCounts[v] || 0) + 1;
                });
                
                const distData = Object.entries(categoryCounts).map(([name, value]) => ({
                    name: String(name).substring(0, 20),
                    value,
                    percentage: ((value / values.length) * 100)
                })).sort((a, b) => b.value - a.value);

                const mode = distData[0]?.name || 'N/A';
                
                newCategoricalDists[col] = distData;
                
                newStats[col] = {
                    type: 'categorical',
                    unique: unique.length,
                    mode: mode,
                    missing: ((recordCount - values.length) / recordCount * 100).toFixed(1) + '%'
                };

                // [IMPROVEMENT] Categorical Dominance Insight
                if (distData.length > 1 && distData[0].percentage > 70) {
                     newInsights.push({
                        agent: 'Insight',
                        text: `Dominant category found in **${col}**: **${distData[0].name}** accounts for ${distData[0].percentage.toFixed(1)}% of records.`,
                        type: 'info'
                    });
                }
            }
        });

        // Correlation Analysis
        const numCols = cols.filter(c => newStats[c]?.type === 'numeric');
        const corrMatrix = [];
        const corrMap = {}; // Map for easy access and heatmap component
        
        numCols.forEach(col => corrMap[col] = {});

        for (let i = 0; i < numCols.length; i++) {
            for (let j = i; j < numCols.length; j++) {
                const col1 = numCols[i];
                const col2 = numCols[j];
                const corr = i === j ? 1 : calculateCorrelation(data, col1, col2);
                
                corrMap[col1][col2] = corr;
                corrMap[col2][col1] = corr;

                if (i !== j) {
                    corrMatrix.push({
                        col1: col1,
                        col2: col2,
                        correlation: corr
                    });
                    if (Math.abs(corr) > 0.7) {
                        newInsights.push({
                            agent: 'Analyst',
                            text: `Strong **${corr > 0 ? 'positive' : 'negative'}** correlation found between **${col1}** and **${col2}** (r = ${corr.toFixed(2)}).`,
                            type: 'info'
                        });
                    }
                }
            }
        }

        // Bivariate Analysis - Categorical vs Numeric (Code Cell 18/19 logic)
        const catCols = cols.filter(c => newStats[c]?.type === 'categorical' && newStats[c].unique < 15); // Limit categories for plotting
        catCols.forEach(catCol => {
            numCols.forEach(numCol => {
                const groups = {};
                data.forEach(row => {
                    const cat = row[catCol];
                    const num = row[numCol];
                    if (cat != null && typeof num === 'number' && !isNaN(num)) {
                        if (!groups[cat]) groups[cat] = { values: [], count: 0 };
                        groups[cat].values.push(num);
                        groups[cat].count++;
                    }
                });
                
                const chartData = Object.entries(groups).map(([category, { values, count }]) => {
                    const mean = values.reduce((a, b) => a + b, 0) / count;
                    const sorted = values.sort((a, b) => a - b);
                    const mid = Math.floor(sorted.length / 2);
                    const median = count % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
                    
                    return {
                        category: String(category).substring(0, 15),
                        mean: mean,
                        median: median,
                        min: Math.min(...values),
                        max: Math.max(...values),
                        count: count
                    };
                }).sort((a, b) => b.mean - a.mean);
                
                newBivariateData[`${catCol}_vs_${numCol}`] = chartData;
            });
        });

        // Final Insight
        if (recordCount > 10) {
            newInsights.push({
                agent: 'Insight',
                text: `Analysis successfully completed on **${recordCount} records** across **${cols.length} features**. Found **${numCols.length}** numeric and **${catCols.length}** categorical columns.`,
                type: 'success'
            });
        }

        setStats(newStats);
        setInsights(newInsights);
        setCorrelations(corrMatrix);
        setDistributions(newDistributions);
        setCategoricalDists(newCategoricalDists);
        setBivariateData(newBivariateData);
    };

    const deleteDataset = (id) => {
        const updated = datasets.filter(d => d.id !== id);
        saveUserData(updated);
        if (activeDataset?.id === id) {
            setActiveDataset(null);
            setView('manager');
            setStats(null);
            setInsights([]);
        }
        showNotification('Dataset deleted successfully.', 'success');
    };

    const exportData = () => {
        if (!activeDataset) return;
        const csv = Papa.unparse(activeDataset.data);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeDataset.name.replace(/\.csv|\.json/i, '')}_export.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const exportReport = () => {
        if (!activeDataset) return;
        
        const markdown = `# DataMind Comprehensive Analysis Report

**Dataset:** ${activeDataset.name}
**Date:** ${new Date().toLocaleDateString()}
**Records:** ${activeDataset.data.length}
**Features:** ${activeDataset.columns.length}

## Executive Summary (Key Insights)

${insights.map(i => `- **[${i.agent}]** ${i.text.replace(/\*\*/g, '')}`).join('\n')}

## Statistical Summary

${Object.entries(stats || {}).map(([col, stat]) => {
            if (stat.type === 'numeric') {
                return `### ${col} (Numeric)
- **Mean:** ${stat.mean}
- **Median:** ${stat.median}
- **Std Dev:** ${stat.std}
- **CV (%):** ${stat.cv || 'N/A'}
- **Range:** ${stat.min} - ${stat.max}
- **Missing:** ${stat.missing}`;
            } else {
                return `### ${col} (Categorical)
- **Unique Values:** ${stat.unique}
- **Mode:** ${stat.mode}
- **Missing:** ${stat.missing}
- **Top Categories:** ${categoricalDists[col]?.slice(0, 3).map(d => `${d.name} (${d.percentage.toFixed(1)}%)`).join(', ')}`;
            }
        }).join('\n\n')}

## Correlation Analysis (r > |0.5|)

${correlations.filter(c => Math.abs(c.correlation) > 0.5).map(c => 
            `- **${c.col1}** vs **${c.col2}**: ${c.correlation.toFixed(3)}`
        ).join('\n')}

---
*Generated by DataMind - Advanced Analytics Platform*
`;
        
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'datamind_comprehensive_report.md';
        a.click();
        URL.revokeObjectURL(url);
        showNotification('Report exported successfully!', 'success');
    };








// --- NEW FUNCTION: Export Analysis as Jupyter Notebook (.ipynb) ---
const exportNotebook = () => {
    if (!activeDataset || !stats) {
        showNotification('Please load and analyze a dataset first.', 'error');
        return;
    }

    // A placeholder for the actual analysis script, dynamically generated based on the dataset
    const analysisScript = `
# DataMind Automated Analysis for ${activeDataset.name}

import pandas as pd
import numpy as np

# Load the data (ASSUMES FILE IS IN THE SAME DIRECTORY)
df = pd.read_csv('${activeDataset.name}')
print(f"Dataset loaded successfully with shape: {df.shape}")

# --- 1. DATA OVERVIEW ---
print("\\n--- Data Overview ---")
print(df.info())
print("\\nMissing Values:")
print(df.isnull().sum())

# --- 2. STATISTICAL SUMMARY (NUMERIC) ---
print("\\n--- Numerical Summary ---")
print(df.describe())

# --- 3. TOP CORRELATIONS ---
numeric_cols = df.select_dtypes(include=[np.number]).columns
if len(numeric_cols) > 1:
    print("\\n--- Top Correlations ---")
    print(df[numeric_cols].corr().unstack().sort_values(ascending=False).drop_duplicates().head(5))

# --- 4. CATEGORICAL FREQUENCIES ---
for col in df.select_dtypes(include='object').columns:
    print(f"\\n--- {col} Frequencies ---")
    print(df[col].value_counts(normalize=True).mul(100).round(2))

# NOTE: Visualizations (matplotlib, seaborn) are not included in this basic text export,
# but can be added manually after running the notebook.
    `;

    // Jupyter Notebook JSON structure (minimum required format)
    const notebookContent = {
        "cells": [
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    `# DataMind Automated Analysis for ${activeDataset.name}\n\n`,
                    `**Generated on:** ${new Date().toLocaleDateString()}\n`,
                    `**Records:** ${activeDataset.data.length}\n`,
                    `**Features:** ${activeDataset.columns.length}`
                ]
            },
            {
                "cell_type": "code",
                "execution_count": null,
                "metadata": {},
                "outputs": [],
                "source": [
                    analysisScript
                ]
            }
        ],
        "metadata": {
            "kernelspec": {
                "display_name": "Python 3",
                "language": "python",
                "name": "python3"
            },
            "language_info": {
                "codemirror_mode": {
                    "name": "ipython",
                    "version": 3
                },
                "file_extension": ".py",
                "mimetype": "text/x-python",
                "name": "python",
                "nbconvert_exporter": "python",
                "pygments_lexer": "ipython3",
                "version": "3.9.7"
            }
        },
        "nbformat": 4,
        "nbformat_minor": 5
    };

    const jsonString = JSON.stringify(notebookContent);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeDataset.name.replace(/\.csv|\.json/i, '')}_analysis.ipynb`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Jupyter Notebook exported successfully!', 'success');
};







    // Chat Handler (Updated with more specific responses based on improved stats)
 const handleChat = () => {
    if (!chatInput.trim() || !activeDataset) return;

    const userMsg = { role: 'user', text: chatInput };
    const query = chatInput.toLowerCase();
    let response = '';

    const newChatHistory = [...chatMessages, userMsg];
    setChatMessages(newChatHistory);
    setChatInput('');
    
    // Define helper variables dynamically
    const numCols = activeDataset.columns.filter(c => stats?.[c]?.type === 'numeric');
    const catCols = activeDataset.columns.filter(c => stats?.[c]?.type === 'categorical');

    setTimeout(() => {
        if (query.includes('summary') || query.includes('summarize')) {
            const numCount = numCols.length;
            const catCount = catCols.length;
            response = `This dataset contains **${activeDataset.data.length} records** with **${activeDataset.columns.length} columns** (${numCount} numeric, ${catCount} categorical). The strongest correlation found is ${correlations[0]?.col1} vs ${correlations[0]?.col2} (${correlations[0]?.correlation.toFixed(2)}).`;
        } else if (query.includes('column') || query.includes('feature') || query.includes('what are')) {
            response = `The dataset has the following columns:\n\n**Numeric:** ${numCols.join(', ')}\n\n**Categorical:** ${catCols.join(', ')}`;
        } else if (query.includes('correlation')) {
            const topCorr = correlations.filter(c => Math.abs(c.correlation) > 0.6).slice(0, 3);
            response = topCorr.length > 0
                ? `Top correlations (r > 0.6) found:\n${topCorr.map(c => `- **${c.col1}** & **${c.col2}**: ${c.correlation.toFixed(2)}`).join('\n')}`
                : 'No strong correlations (r > 0.6) detected in the dataset.';
        } else if (query.includes('distribution') || query.includes('spread') || query.includes('range')) {
            const colMatch = numCols.find(c => query.includes(c.toLowerCase()));
            if (colMatch) {
                const stat = stats[colMatch];
                const iqr = parseFloat(stat.q3) - parseFloat(stat.q1);
                response = `The distribution for **${colMatch}** spans from **${stat.min}** to **${stat.max}** (Range: ${(parseFloat(stat.max) - parseFloat(stat.min)).toFixed(2)}). The Interquartile Range (IQR) is **${iqr.toFixed(2)}**, meaning 50% of values fall between ${stat.q1} and ${stat.q3}.`;
            } else {
                response = 'Please specify a numeric column to analyze its distribution or spread.';
            }
        } else if (query.includes('category') || query.includes('mode') || query.includes('frequent')) {
            const colMatch = catCols.find(c => query.includes(c.toLowerCase()));
            if (colMatch) {
                const topCats = categoricalDists[colMatch]?.slice(0, 3);
                const mode = stats[colMatch].mode;
                
                if (topCats?.length > 0) {
                     response = `The most frequent category in **${colMatch}** is **${mode}** (${topCats[0].percentage.toFixed(1)}%). The next top categories are: ${topCats.slice(1).map(c => `${c.name} (${c.percentage.toFixed(1)}%)`).join(', ')}.`;
                } else {
                    response = `The most frequent category in **${colMatch}** is **${mode}**.`;
                }
            } else {
                response = 'Please specify a categorical column to find its most frequent categories.';
            }
        } else if (query.includes('highest') || query.includes('maximum') || query.includes('max')) {
            const colMatch = numCols.find(c => query.includes(c.toLowerCase()));
            if (colMatch) {
                response = `The maximum value in **${colMatch}** is **${stats[colMatch].max}**.`;
            } else {
                response = 'Please specify a numeric column name.';
            }
        } else if (query.includes('average') || query.includes('mean')) {
            const colMatch = numCols.find(c => query.includes(c.toLowerCase()));
            if (colMatch) {
                response = `The average of **${colMatch}** is **${stats[colMatch].mean}** (median: ${stats[colMatch].median}).`;
            } else {
                response = 'Please specify a numeric column name.';
            }
        } else if (query.includes('insight') || query.includes('pattern') || query.includes('anomal')) {
            response = insights.length > 0
                ? `Key findings and anomalies:\n\n${insights.filter(i => i.type !== 'success').map(i => `**${i.agent}**: ${i.text}`).join('\n\n')}`
                : 'Analysis complete. No significant patterns or anomalies were detected.';
        } else {
            // Enhanced Generic help suggestion
            response = `I can help analyze your data! Try asking:\n\n- "**Summarize** the dataset"\n- "What is the **average** of [Numeric Column]?"\n- "Show **correlations**"\n- "What is the **distribution** of [Numeric Column]?"\n- "What are the **top categories** in [Categorical Column]?"`;
        }

        const botMsg = { role: 'assistant', text: response };
        setChatMessages(prev => [...prev, botMsg]);
    }, 500);
};

    // --- UI Components for Explorer View ---

    // [NEW COMPONENT] Correlation Heatmap
    const CorrelationHeatmap = () => {
        const numCols = activeDataset.columns.filter(c => stats?.[c]?.type === 'numeric');
        const data = correlations.map(c => ({ 
            ...c, 
            correlation: c.correlation.toFixed(2) // Display rounded value
        })).sort((a,b) => Math.abs(b.correlation) - Math.abs(a.correlation));

        // Create the matrix structure for a better visual representation
        const matrixData = numCols.map(col1 => numCols.map(col2 => {
            const corrObj = data.find(c => (c.col1 === col1 && c.col2 === col2) || (c.col1 === col2 && c.col2 === col1));
            return parseFloat(corrObj?.correlation || (col1 === col2 ? 1 : 0)).toFixed(2);
        }));

        const getColor = (value) => {
            const v = parseFloat(value);
            if (v === 1) return 'bg-white text-gray-900 font-bold';
            const intensity = Math.round(Math.abs(v) * 9); // 0 to 9 scale
            if (v > 0) return `bg-red-700/${intensity * 10} text-white`;
            if (v < 0) return `bg-blue-700/${intensity * 10} text-white`;
            return 'bg-gray-700 text-gray-400';
        };

        if (numCols.length < 2) return <p className="text-center text-gray-400 p-8">Need at least two numeric columns for correlation analysis.</p>;

        return (
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700 table-fixed">
                    <thead>
                        <tr>
                            <th className="px-4 py-2 text-left text-sm font-semibold text-emerald-300 w-28">Feature</th>
                            {numCols.map(col => (
                            // Set a fixed width for the TH
                            <th key={col} className="px-1 py-2 text-center text-xs font-semibold text-emerald-300 w-28 h-20"> 
                                {/* Use a wrapper div for rotation and positioning */}
                                <div className="flex items-end justify-center h-full overflow-hidden"> 
                                    <span className="transform rotate-[0deg] whitespace-nowrap text-left translate-y-0 translate-x-4 w-full block">
                                        {col}
                                    </span>
                                </div>
                            </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {numCols.map((col1, i) => (
                            <tr key={col1} className="hover:bg-slate-700/50">
                                <td className="px-4 py-3 text-left font-medium text-emerald-200 text-sm w-28 whitespace-nowrap">{col1}</td>
                                {numCols.map((col2, j) => (
                                    <td 
                                        key={`${col1}-${col2}`} 
                                        className={`px-1 py-1 text-center font-bold text-sm border border-slate-800 transition ${getColor(matrixData[i][j])} ${i===j ? 'ring-2 ring-emerald-400/50' : ''}`}
                                        title={`r = ${matrixData[i][j]}`}
                                    >
                                        {matrixData[i][j]}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="mt-4 p-4 bg-slate-800/50 rounded-lg">
                    <h4 className="text-lg font-semibold text-emerald-300 mb-2">Top Correlated Pairs (|r| > 0.5)</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
                        {data.filter(c => Math.abs(c.correlation) > 0.5).slice(0, 5).map(c => (
                            <li key={`${c.col1}-${c.col2}`} className={c.correlation > 0.7 ? 'text-red-300' : (c.correlation < -0.7 ? 'text-blue-300' : '')}>
                                **{c.col1}** vs **{c.col2}**: {c.correlation} ({c.correlation > 0 ? 'Positive' : 'Negative'})
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        );
    };

    // [NEW COMPONENT] Categorical vs Numeric Bar Chart (Mean/Median comparison)
    const CatVsNumChart = ({ chartData, catCol, numCol }) => {
        if (!chartData || chartData.length === 0) return <p className="text-center text-gray-400">No valid data found for {catCol} vs {numCol}.</p>;
        
        // Sort data by mean for better visual comparison
        const sortedData = [...chartData].sort((a, b) => b.mean - a.mean);
        const categories = sortedData.map(d => d.category);

        return (
            <div className="w-full h-96">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={sortedData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                        <XAxis 
                            dataKey="category" 
                            angle={-15} // Increase rotation from -15 to -45 degrees
                            textAnchor="end"  // Anchor the text end at the tick mark
                            height={60}     // Increase height for rotated labels
                            interval={0}    // Ensure every label is displayed
                            stroke="#94a3b8" 
                        />
                        <YAxis yAxisId="left" stroke="#10b981" label={{ value: `Avg ${numCol}`, angle: -90, position: 'insideLeft', fill: '#10b981' }} />
                        
                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #059669', color: 'white' }} 
                            formatter={(value, name, props) => [`${parseFloat(value).toFixed(2)}`, name]}
                        />
                        <Legend wrapperStyle={{ paddingTop: '15px' }} />

                        {/* Mean as Bar Chart */}
                        <Bar yAxisId="left" dataKey="mean" name={`Mean ${numCol}`} fill="#10b981">
                            {sortedData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Bar>
                        
                        {/* Median as Line or Scatter Plot (using Line for simplicity here) */}
                        <Line yAxisId="left" type="monotone" dataKey="median" name={`Median ${numCol}`} stroke="#f59e0b" strokeWidth={3} dot={{ stroke: '#f59e0b', strokeWidth: 2, r: 4 }} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        );
    };

    // [NEW COMPONENT] Numeric Histogram
    const NumericHistogram = ({ data, col }) => (
        <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                    <XAxis dataKey="range" stroke="#94a3b8" interval={data.length > 10 ? 2 : 0} />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #059669', color: 'white' }} />
                    <Bar dataKey="count" fill="#3b82f6" name="Frequency" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
    
    // [NEW COMPONENT] Categorical Pie Chart
    const CategoricalPieChart = ({ data, col }) => (
        <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                    <Pie
                        data={data}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        fill="#8884d8"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #059669', color: 'white' }} 
                        formatter={(value, name, props) => [`${value} (${props.payload.percentage.toFixed(1)}%)`, name]}
                    />
                    <Legend wrapperStyle={{ paddingTop: '5px' }} />
                </RePieChart>
            </ResponsiveContainer>
        </div>
    );


    // --- View Renderings (Manager, Explorer, Chat) ---

    // Manager View
    const renderManager = () => (
        <div className="p-8 container mx-auto">
            <h2 className="text-3xl font-extrabold text-emerald-400 mb-6 flex items-center gap-2">
                <Database className="w-7 h-7" /> Dataset Manager
            </h2>
            
            {isAnalyzing ? (
                <div className="p-10 bg-slate-800/70 rounded-xl flex flex-col items-center justify-center border border-emerald-500/30">
                    <Activity className="w-8 h-8 text-emerald-400 animate-spin" />
                    <p className="mt-4 text-lg font-medium">Analyzing Data... This may take a moment.</p>
                </div>
            ) : (
                <>
                    <div className="bg-slate-800/70 p-6 rounded-xl border border-emerald-500/30 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <p className="text-lg font-semibold">Upload a new CSV file to begin analysis.</p>
                        <label htmlFor="file-upload" className="cursor-pointer px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-lg transition shadow-md flex items-center gap-2 flex-shrink-0">
                            <Upload className="w-5 h-5" /> Upload CSV
                        </label>
                        <input id="file-upload" type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                    </div>

                    <h3 className="text-2xl font-semibold text-emerald-300 mb-4">Your Uploaded Datasets ({datasets.length})</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {datasets.length === 0 ? (
                            <div className="col-span-full p-8 text-center bg-slate-800/50 rounded-lg text-gray-400">
                                <FileText className="w-6 h-6 mx-auto mb-2" />
                                <p>No datasets uploaded yet.</p>
                            </div>
                        ) : (
                            datasets.map(d => (
                                <div key={d.id} className={`bg-slate-800/70 p-5 rounded-lg shadow-xl border ${activeDataset?.id === d.id ? 'border-emerald-500 ring-2 ring-emerald-400/50' : 'border-slate-700'} transition`}>
                                    <h4 className="text-xl font-bold mb-2 truncate text-emerald-200">{d.name}</h4>
                                    <p className="text-sm text-gray-400">Records: <span className="font-semibold text-white">{d.data.length}</span></p>
                                    <p className="text-sm text-gray-400">Features: <span className="font-semibold text-white">{d.columns.length}</span></p>
                                    <p className="text-xs text-gray-500 mt-1">Uploaded: {new Date(d.uploadedAt).toLocaleDateString()}</p>
                                    <div className="mt-4 flex gap-3">
                                        <button 
                                            onClick={() => { setActiveDataset(d); analyzeDataset(d); setView('explorer'); }} 
                                            className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-medium transition flex items-center justify-center gap-1"
                                        >
                                            <Eye className="w-4 h-4" /> Analyze
                                        </button>
                                        <button 
                                            onClick={() => deleteDataset(d.id)} 
                                            className="p-2 bg-red-600/30 hover:bg-red-600/50 rounded-lg transition"
                                            title="Delete Dataset"
                                        >
                                            <Trash2 className="w-4 h-4 text-red-400" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );

    // Explorer View
    const renderExplorer = () => {
        if (!activeDataset || !stats) return <div className="p-8 text-center text-gray-400">Please select an active dataset to start exploring.</div>;

        const numCols = activeDataset.columns.filter(c => stats?.[c]?.type === 'numeric');
        const catCols = activeDataset.columns.filter(c => stats?.[c]?.type === 'categorical' && stats[c].unique < 15);
        
        const numericStats = numCols.map(col => ({ col, ...stats[col] }));
        const categoricalStats = catCols.map(col => ({ col, ...stats[col] }));
        
        const currentBivariatePair = activeDataset.columns.find(col => bivariateData[`${col}_vs_${numCols[0]}`]) || catCols[0];
        const initialBivariateData = currentBivariatePair ? bivariateData[`${currentBivariatePair}_vs_${numCols[0]}`] : null;

        return (
            <div className="p-8 container mx-auto">
                <div className="flex items-center justify-between border-b border-emerald-500/30 pb-4 mb-6">
                    <h2 className="text-3xl font-extrabold text-emerald-400 truncate flex items-center gap-2">
                        <BarChart3 className="w-7 h-7" /> Explorer: {activeDataset.name}
                    </h2>
                    <div className="flex gap-3">
                        <button onClick={exportReport} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium flex items-center gap-1"><FileText className="w-4 h-4" /> Export Report</button>
                        <button onClick={exportData} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium flex items-center gap-1"><Download className="w-4 h-4" /> Export Data</button>
                        <button onClick={exportNotebook} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium flex items-center gap-1">
                            <FileText className="w-4 h-4" /> Export IPYNB
                        </button>
                    </div>
                </div>

                {/* Explorer Tabs */}
                <div className="flex gap-2 border-b border-slate-700 mb-6">
                    {['univariate', 'correlation', 'bivariate', 'insights', 'decision', 'template', 'quality', 'segmentation', 'predictive'].map(tab => (
                        <button 
                            key={tab} 
                            onClick={() => setExplorerTab(tab)} 
                            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${explorerTab === tab ? 'border-emerald-400 text-emerald-300' : 'border-transparent text-gray-400 hover:text-emerald-300'}`}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                {explorerTab === 'univariate' && (
                    <div className="space-y-8">
                        {/* Numerical Summary Table */}
                        <div className="bg-slate-800/70 p-6 rounded-xl border border-slate-700">
                            <h3 className="text-2xl font-semibold text-emerald-300 mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5" /> Numerical Distributions & Stats</h3>
                            <div className="overflow-x-auto mb-6">
                                <table className="min-w-full divide-y divide-gray-700">
                                    <thead className="bg-slate-700">
                                        <tr>
                                            {['Feature', 'Mean', 'Median', 'Std Dev', 'CV (%)', 'Min', 'Max', 'Missing'].map(header => (
                                                <th key={header} className="px-6 py-3 text-left text-xs font-medium text-emerald-300 uppercase tracking-wider">{header}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800">
                                        {numericStats.map(stat => (
                                            <tr key={stat.col} className="hover:bg-slate-700/50">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-emerald-200">{stat.col}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{stat.mean}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{stat.median}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{stat.std}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-yellow-300">{stat.cv}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{stat.min}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{stat.max}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-red-300">{stat.missing}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            
                            {/* Numerical Histograms */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {numCols.map(col => (
                                    <div key={col} className="bg-slate-900 p-4 rounded-lg">
                                        <h4 className="text-lg font-semibold text-emerald-300 mb-2">{col} Distribution (Histogram)</h4>
                                        <NumericHistogram data={distributions[col]} col={col} />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Categorical Summary Table and Charts */}
                        <div className="bg-slate-800/70 p-6 rounded-xl border border-slate-700">
                            <h3 className="text-2xl font-semibold text-emerald-300 mb-4 flex items-center gap-2"><PieChart className="w-5 h-5" /> Categorical Frequencies</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {catCols.map(col => (
                                    <div key={col} className="bg-slate-900 p-4 rounded-lg">
                                        <h4 className="text-lg font-semibold text-emerald-300 mb-2">{col} Distribution (Mode: {stats[col].mode})</h4>
                                        <CategoricalPieChart data={categoricalDists[col]} col={col} />
                                        <p className="mt-2 text-sm text-gray-400">Unique: {stats[col].unique}. Missing: {stats[col].missing}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                {explorerTab === 'quality' && (
                    <QualitySection
                        stats={stats}
                        insights={insights}
                        activeDataset={activeDataset}
                    />
                )}
                
                {explorerTab === 'correlation' && (
                    <div className="bg-slate-800/70 p-6 rounded-xl border border-slate-700">
                        <h3 className="text-2xl font-semibold text-emerald-300 mb-4 flex items-center gap-2"><Layers className="w-5 h-5" /> Correlation Matrix (r)</h3>
                        <CorrelationHeatmap />
                    </div>
                )}
                
                {explorerTab === 'bivariate' && (
                    <div className="bg-slate-800/70 p-6 rounded-xl border border-slate-700">
                        <h3 className="text-2xl font-semibold text-emerald-300 mb-4 flex items-center gap-2"><Grid className="w-5 h-5" /> Categorical vs Numeric Analysis (Mean/Median)</h3>
                        
                        <p className="text-gray-400 mb-4">Select a categorical feature to see how it affects the mean and median of numeric features (e.g., Price by Gender).</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {catCols.map(catCol => numCols.map(numCol => {
                                const key = `${catCol}_vs_${numCol}`;
                                const chartData = bivariateData[key];
                                return (
                                    <div key={key} className="bg-slate-900 p-4 rounded-lg">
                                        <h4 className="text-lg font-semibold text-emerald-300 mb-2 truncate" title={`${catCol} vs ${numCol}`}>{catCol} vs {numCol}</h4>
                                        <CatVsNumChart chartData={chartData} catCol={catCol} numCol={numCol} />
                                    </div>
                                );
                            }))}
                            {catCols.length === 0 && <p className="col-span-full text-center text-gray-400">No categorical columns suitable for Bivariate analysis (Unique &lt; 15).</p>}
                        </div>
                    </div>
                )}
                
                {explorerTab === 'insights' && (
                    <div className="bg-slate-800/70 p-6 rounded-xl border border-slate-700">
                        <h3 className="text-2xl font-semibold text-emerald-300 mb-4 flex items-center gap-2"><Zap className="w-5 h-5" /> Key Insights & Data Anomalies</h3>
                        <div className="space-y-4">
                            {insights.length === 0 ? (
                                <p className="text-gray-400">No specific insights or anomalies were detected during the initial scan.</p>
                            ) : (
                                insights.map((insight, index) => (
                                    <div key={index} className={`p-4 rounded-lg flex items-start gap-3 ${insight.type === 'warning' ? 'bg-yellow-600/20 border border-yellow-500 text-yellow-100' : 'bg-emerald-600/20 border border-emerald-500 text-emerald-100'}`}>
                                        <Brain className="w-5 h-5 flex-shrink-0 mt-1" />
                                        <div>
                                            <p className="font-semibold text-sm mb-1">{insight.agent}</p>
                                            <p className="text-sm" dangerouslySetInnerHTML={{ __html: insight.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* --- NEW DECISION CENTER SECTION --- */}
                {explorerTab === 'decision' && (
                    <DecisionSection 
                        insights={insights}
                        stats={stats}
                        correlations={correlations}
                    />
                )}

                {explorerTab === 'template' && (
                    <TemplateSection 
                        categoricalCols={activeDataset.columns.filter(c => stats?.[c]?.type === 'categorical')}
                        numericalCols={activeDataset.columns.filter(c => stats?.[c]?.type === 'numeric')}
                    />
                )}
                {explorerTab === 'quality' && (
                    <QualitySection
                        stats={stats}
                        insights={insights}
                        activeDataset={activeDataset}
                    />
                )}

                {explorerTab === 'segmentation' && (
                    <SegmentationBlueprint 
                        stats={stats}
                        correlations={correlations}
                        bivariateData={bivariateData}
                    />
                )}
                {explorerTab === 'predictive' && (
                    <FeatureImportanceSection 
                        stats={stats}
                        correlations={correlations}
                        bivariateData={bivariateData}
                    />
                )}
            </div>
        );
    };

    // Chat View
    const renderChat = () => (
        <div className="flex h-[calc(100vh-80px)]">
            {/* Analysis Panel - Left Side */}
            <div className="w-1/3 p-6 border-r border-emerald-500/30 overflow-y-auto bg-slate-900/50 hidden lg:block">
                <h3 className="text-xl font-bold text-emerald-300 mb-4 flex items-center gap-2"><Eye className="w-5 h-5" /> Current Dataset Snapshot</h3>
                <p className="text-sm text-gray-400 mb-4">Dataset: <strong className="text-emerald-200">{activeDataset?.name}</strong> ({activeDataset?.data.length} records)</p>

                <div className="space-y-4">
                    <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                        <h4 className="text-lg font-semibold text-emerald-300 mb-2">Key Metrics</h4>
                        <ul className="text-sm space-y-1 text-gray-300">
                            <li>Numeric Cols: <strong className="text-white">{activeDataset.columns.filter(c => stats?.[c]?.type === 'numeric').length}</strong></li>
                            <li>Categorical Cols: <strong className="text-white">{activeDataset.columns.filter(c => stats?.[c]?.type === 'categorical').length}</strong></li>
                            <li>Strong Correlations (>|0.7|): <strong className="text-red-300">{correlations.filter(c => Math.abs(c.correlation) > 0.7).length}</strong></li>
                        </ul>
                    </div>

                    <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                        <h4 className="text-lg font-semibold text-emerald-300 mb-2">Top Insights</h4>
                        <ul className="text-sm space-y-2 text-gray-300">
                            {insights.slice(0, 5).map((insight, index) => (
                                <li key={index} className="flex items-start gap-2">
                                    <Zap className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-1" />
                                    <p dangerouslySetInnerHTML={{ __html: insight.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            {/* Chat Area - Right Side */}
            <div className="flex-1 flex flex-col">
                <div className="flex-1 p-6 overflow-y-auto space-y-4">
                    <div className="p-4 bg-emerald-600/30 rounded-lg self-start max-w-xl">
                        <p className="font-semibold text-emerald-100">AI Assistant</p>
                        <p className="text-sm text-white">Hello! I'm your DataMind AI. Ask me anything about your active dataset, "{activeDataset.name}".</p>
                        <p className="text-xs text-emerald-200/70 mt-1">Try: "What is the average of Price?", "Show strong correlations", or "Which column has the highest CV?"</p>
                    </div>
                    {chatMessages.map((msg, index) => (
                        <div key={index} className={`p-4 rounded-lg max-w-xl ${msg.role === 'user' ? 'bg-slate-700/50 ml-auto' : 'bg-emerald-600/30 self-start'}`}>
                            <p className="font-semibold text-emerald-100">{msg.role === 'user' ? 'You' : 'AI Assistant'}</p>
                            <p className="text-sm whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: msg.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }} />
                        </div>
                    ))}
                    <div ref={chatEndRef} />
                </div>

                {/* Chat Input */}
                <div className="p-4 border-t border-emerald-500/30 bg-black/30 sticky bottom-0">
                    <form onSubmit={(e) => { e.preventDefault(); handleChat(); }} className="flex gap-3">
                        <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            className="flex-1 bg-slate-700/50 rounded-lg px-4 py-3 border border-emerald-500/30 focus:border-emerald-400 focus:outline-none text-white placeholder-gray-400"
                            placeholder="Ask the AI a question about your data..."
                            disabled={!activeDataset}
                        />
                        <button 
                            type="submit" 
                            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-bold transition flex items-center gap-2 disabled:opacity-50"
                            disabled={!activeDataset || !chatInput.trim()}
                        >
                            <MessageSquare className="w-5 h-5" /> Send
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );


    // Main App Return
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 text-white">
            <AlertMessage {...notification} onClose={() => setNotification({ message: '', type: '' })} />

            <header className="border-b border-emerald-500/30 bg-black/30 backdrop-blur-sm sticky top-0 z-50">
                <div className="container mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <Brain className="w-8 h-8 text-emerald-400" />
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">DataMind</h1>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex gap-2">
                            {['manager', 'explorer', 'chat'].map(v => (
                                <button key={v} onClick={() => setView(v)} disabled={v !== 'manager' && !activeDataset} className={`px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition ${view === v ? 'bg-emerald-600 shadow-md' : 'bg-white/10 hover:bg-white/20'} disabled:opacity-50 disabled:cursor-not-allowed`}>
                                    {v === 'manager' && <Database className="w-4 h-4" />}
                                    {v === 'explorer' && <BarChart3 className="w-4 h-4" />}
                                    {v === 'chat' && <MessageSquare className="w-4 h-4" />}
                                    {v.charAt(0).toUpperCase() + v.slice(1)}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-3 pl-4 border-l border-emerald-500/30">
                            <div className="text-right hidden sm:block">
                                <p className="text-sm font-semibold text-emerald-300">{currentUser?.name}</p>
                                <p className="text-xs text-emerald-400/60">{currentUser?.email}</p>
                            </div>
                            <button onClick={handleLogout} className="p-3 bg-red-600/20 hover:bg-red-600/30 rounded-full transition" title="Logout">
                                <LogOut className="w-4 h-4 text-red-400" />
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main>
                {view === 'manager' && renderManager()}
                {view === 'explorer' && renderExplorer()}
                {view === 'chat' && renderChat()}
            </main>
        </div>
    );
}



// --- NEW COMPONENT: Template Section (Try?) ---
const TemplateSection = ({ categoricalCols, numericalCols }) => {
    // Generate the Python script dynamically based on the current dataset's column names
    const templateCode = `
# --- TEMPLATE: ADVANCED EDA VISUALIZATIONS ---

# 1. SETUP: Import Libraries and Set Styles
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

# Set visualization style and display options
sns.set_style("whitegrid")
plt.rcParams['figure.figsize'] = (10, 6)
pd.set_option('display.max_columns', None)

# --- 2. DATA LOADING & CLEANING ---
# ASSUMPTION: df is your loaded and cleaned DataFrame.
# Example Cleaning: df['Gender'] = df['Gender'].replace('Femal', 'Female')

# Define Variable Types (from analysis)
numerical_cols = ['${numericalCols.join("', '")}']
categorical_cols = ['${categoricalCols.join("', '")}']
df_numeric = df[numerical_cols]
df_categorical = df[categorical_cols].select_dtypes(include='object')


# --- 3. UNIVARIATE ANALYSIS: Distributions & Outliers ---

print("Generating Histograms (Numerical)...")
if not df_numeric.empty:
    df_numeric.hist(bins=30, figsize=(15, 12), edgecolor='black')
    plt.suptitle('Distribution of Numerical Variables', fontsize=16, y=1.02, fontweight='bold')
    plt.tight_layout(rect=[0, 0.03, 1, 0.95])
    plt.show()

print("Generating Boxplots (Outlier Detection)...")
if not df_numeric.empty:
    df.boxplot(column=numerical_cols, figsize=(15, 6), vert=False)
    plt.title('Outlier Detection (Boxplots)', fontsize=16)
    plt.show()

# --- 4. BIVARIATE ANALYSIS: Relationships & Grouping ---

# A. Correlation Heatmap
if len(numerical_cols) > 1:
    print("\nGenerating Correlation Heatmap...")
    correlation_matrix = df_numeric.corr()
    plt.figure(figsize=(10, 8))
    sns.heatmap(correlation_matrix, annot=True, cmap='coolwarm', center=0, fmt='.2f', linewidths=.5)
    plt.title('Correlation Matrix', fontsize=16)
    plt.show()
    
# B. Categorical vs. Numerical GroupBy (Price, Salary, etc. by Category)
if not df_categorical.empty and not df_numeric.empty:
    print("\nGenerating Categorical vs. Numerical Group Stats...")
    # Example: Price stats grouped by the first categorical column
    first_cat = categorical_cols[0] 
    price_stats = df.groupby(first_cat)['Price'].agg(['count', 'mean', 'median', 'std', 'min', 'max'])
    print(price_stats.round(2))
    
# C. Categorical Frequencies (Bar Plots)
if not df_categorical.empty:
    print("\nGenerating Categorical Bar Plots...")
    n_plots = len(categorical_cols)
    n_rows = int(np.ceil(n_plots / 4))
    fig, axes = plt.subplots(nrows=n_rows, ncols=min(n_plots, 4), figsize=(20, 5 * n_rows))
    axes = axes.flatten()

    for i, col in enumerate(categorical_cols):
        # Use try/except for safer iteration over axes if n_plots is small
        try:
            sns.countplot(y=df[col], ax=axes[i], order=df[col].value_counts().index, palette='viridis')
            axes[i].set_title(f'Frequency of {col}')
        except IndexError:
            break
            
    plt.suptitle('Distribution of Categorical Variables', fontsize=16, y=1.02)
    plt.tight_layout()
    plt.show()
`;

    return (
        <div className="bg-slate-800/70 p-6 rounded-xl border border-slate-700">
            <h3 className="text-2xl font-extrabold text-emerald-400 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5" /> Try? IPYNB Template for Visual EDA
            </h3>
            <p className="text-gray-400 mb-4">
                Copy the code below directly into a cell of your Jupyter Notebook (.ipynb) or Colab to reproduce the key visualizations and calculations from the full analysis.
            </p>
            <div className="bg-slate-900 p-4 rounded-lg overflow-x-auto font-mono text-sm">
                <pre className="whitespace-pre">{templateCode}</pre>
            </div>
        </div>
    );
};



// --- NEW COMPONENT: Decision Section (Highest Impact Insights) ---
const DecisionSection = ({ insights, stats, correlations }) => {
    // 1. Identify the most critical statistical variables (High CV, High Missing)
    const criticalStats = Object.entries(stats || {})
        .filter(([col, stat]) => stat.type === 'numeric' && stat.cv && parseFloat(stat.cv) > 50)
        .sort(([, a], [, b]) => parseFloat(b.cv) - parseFloat(a.cv))
        .map(([col, stat]) => ({ col, reason: `Extreme Inconsistency (CV: ${stat.cv}%)` }));

    // 2. Identify the highest correlations for potential predictive/causal relationships
    const topCorrelations = correlations
        .filter(c => Math.abs(c.correlation) >= 0.7)
        .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
        .slice(0, 3);
        
    // 3. Filter critical insights generated by the analyst (DANGER/WARNING)
    const criticalInsights = insights.filter(i => 
        i.type === 'danger' || i.type === 'warning' || (i.type === 'info' && i.text.includes('Imbalance'))
    );

    return (
        <div className="p-8 container mx-auto">
            <div className="bg-slate-800/70 p-6 rounded-xl border border-red-500/50 shadow-xl">
                <h2 className="text-3xl font-extrabold text-red-400 mb-6 flex items-center gap-2">
                    <Zap className="w-7 h-7" /> Decision Center: High-Impact Action Items
                </h2>
                <p className="text-gray-400 mb-8">
                    This section highlights the core findings that warrant immediate executive attention because they represent the greatest risks, untapped opportunities, or inconsistencies in the data.
                </p>

                {/* --- 1. CORE PERFORMANCE IMPACT --- */}
                <h3 className="text-2xl font-semibold text-emerald-300 mb-4 border-b border-slate-700 pb-2">
                    1. Market Imbalance & Risk (Segmentation)
                </h3>
                <div className="space-y-4 mb-8">
                    {criticalInsights.length > 0 ? (
                        criticalInsights.map((i, index) => (
                            <div key={index} className={`p-4 rounded-lg bg-red-600/20 border border-red-500 text-red-100`}>
                                <p className="font-semibold text-sm mb-1">IMPACT ALERT: {i.agent.toUpperCase()}</p>
                                <p className="text-sm" dangerouslySetInnerHTML={{ __html: i.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                            </div>
                        ))
                    ) : (
                        <p className="text-gray-400 p-3 bg-slate-700/50 rounded-lg">No severe imbalances (Imbalance &gt; 80%) or major distribution issues were automatically detected.</p>
                    )}
                </div>

                {/* --- 2. KEY RELATIONAL DRIVERS (Predictive Power) --- */}
                <h3 className="text-2xl font-semibold text-emerald-300 mb-4 border-b border-slate-700 pb-2">
                    2. Strongest Data Drivers (Predictive Relationships)
                </h3>
                <ul className="list-disc list-inside space-y-2 text-white/90 mb-8 ml-4">
                    {topCorrelations.length > 0 ? (
                        topCorrelations.map((c, index) => (
                            <li key={index} className="text-lg">
                                High Correlation (r = {c.correlation.toFixed(2)}): The variable {c.col1} is a strong predictor of {c.col2}. 
                                <span className="text-gray-400 block text-sm ml-6">
                                    Action: Use {c.col1} as a primary factor for predicting or segmenting customers based on {c.col2}.
                                </span>
                            </li>
                        ))
                    ) : (
                         <li className="text-gray-400">No strong linear correlations (r &gt; 0.7) found. Relationships may be non-linear or weak.</li>
                    )}
                </ul>

                {/* --- 3. DATA UNCERTAINTY (Data Quality/Stability) --- */}
                <h3 className="text-2xl font-semibold text-emerald-300 mb-4 border-b border-slate-700 pb-2">
                    3. Data Stability and Risk (High Inconsistency)
                </h3>
                <ul className="list-disc list-inside space-y-2 text-white/90 ml-4">
                    {criticalStats.length > 0 ? (
                        criticalStats.map((stat, index) => (
                            <li key={index} className="text-lg text-yellow-300">
                                High Inconsistency Alert: The {stat.col} feature displays highly inconsistent behavior.
                                <span className="text-gray-400 block text-sm ml-6">
                                    Action: The values are unreliable for strict prediction, but their extreme spread (e.g., in income) may point to high-value niche segments (like dual-income households in the Austo report).
                                </span>
                            </li>
                        ))
                    ) : (
                        <li className="text-gray-400">All numerical variables show relatively low inconsistency (CV &lt; 50%). Data is stable.</li>
                    )}
                </ul>

            </div>
        </div>
    );
};

// --- NEW COMPONENT: Data Quality Summary Section ---
const QualitySection = ({ stats, insights, activeDataset }) => {
    if (!stats || !activeDataset) return <div className="p-8 text-center text-gray-400">Analysis required to view data quality.</div>;

    const totalRecords = activeDataset.data.length;
    
    const missingValueSummary = Object.entries(stats)
        .filter(([, stat]) => parseFloat(stat.missing) > 0)
        .sort(([, a], [, b]) => parseFloat(b.missing) - parseFloat(a.missing));

    const highCardinality = Object.entries(stats)
        .filter(([, stat]) => stat.type === 'categorical' && stat.unique / totalRecords > 0.8)
        .map(([col]) => col);
        
    const inconsistentCols = Object.entries(stats)
        .filter(([, stat]) => stat.type === 'numeric' && parseFloat(stat.cv) > 75)
        .map(([col, stat]) => ({col, cv: stat.cv}));

    const typeCounts = {
        numeric: Object.values(stats).filter(s => s.type === 'numeric').length,
        categorical: Object.values(stats).filter(s => s.type === 'categorical').length,
    };

    return (
        <div className="p-8 container mx-auto">
            <div className="bg-slate-800/70 p-6 rounded-xl border border-cyan-500/50 shadow-xl">
                <h2 className="text-3xl font-extrabold text-cyan-400 mb-6 flex items-center gap-2">
                    <Database className="w-7 h-7" /> Data Quality Summary
                </h2>
                <p className="text-gray-400 mb-6">
                    This overview provides a quick diagnostic of data reliability and structure (completeness, consistency, and format).
                </p>

                {/* --- Data Structure and Completeness --- */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="p-4 bg-slate-900 rounded-lg border border-slate-700">
                        <h3 className="text-xl font-semibold text-emerald-300">Total Records</h3>
                        <p className="text-3xl font-bold text-white">{totalRecords}</p>
                    </div>
                    <div className="p-4 bg-slate-900 rounded-lg border border-slate-700">
                        <h3 className="text-xl font-semibold text-emerald-300">Variable Types</h3>
                        <p className="text-lg text-white">Numeric: {typeCounts.numeric} / Categorical: {typeCounts.categorical}</p>
                    </div>
                    <div className={`p-4 rounded-lg border ${missingValueSummary.length > 0 ? 'bg-red-900/40 border-red-500' : 'bg-emerald-900/40 border-emerald-500'}`}>
                        <h3 className="text-xl font-semibold text-emerald-300">Missing Data Status</h3>
                        <p className="text-lg text-white font-bold">{missingValueSummary.length === 0 ? 'Clean' : `${missingValueSummary.length} Columns Affected`}</p>
                    </div>
                </div>

                {/* --- Detailed Findings --- */}
                <h3 className="text-2xl font-semibold text-cyan-300 mb-4 border-b border-slate-700 pb-2">
                    Detailed Findings
                </h3>

                <div className="space-y-4">
                    {/* Missing Values Table */}
                    <div className="p-4 bg-slate-700/50 rounded-lg">
                        <h4 className="text-lg font-semibold text-white mb-2">Incomplete Features (Missing Values)</h4>
                        {missingValueSummary.length > 0 ? (
                            <ul className="list-disc list-inside text-sm text-red-300 ml-4">
                                {missingValueSummary.map(([col, stat]) => (
                                    <li key={col}>{col}: {stat.missing} missing ({Math.round(parseFloat(stat.missing) * totalRecords / 100)} records)</li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-gray-400">Dataset is 100% complete. No missing values detected.</p>
                        )}
                    </div>
                    
                    {/* Data Consistency (CV) */}
                    <div className="p-4 bg-slate-700/50 rounded-lg">
                        <h4 className="text-lg font-semibold text-white mb-2">Inconsistent Numerical Features (CV > 75%)</h4>
                        {inconsistentCols.length > 0 ? (
                            <ul className="list-disc list-inside text-sm text-yellow-300 ml-4">
                                {inconsistentCols.map((item) => (
                                    <li key={item.col}>{item.col}: CV of {item.cv}% (High variability relative to the mean).</li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-gray-400">All numerical features show high stability (CV below 75%).</p>
                        )}
                    </div>

                    {/* Cardinality (Potential IDs/Keys) */}
                    <div className="p-4 bg-slate-700/50 rounded-lg">
                        <h4 className="text-lg font-semibold text-white mb-2">High Cardinality (Potential Keys)</h4>
                        {highCardinality.length > 0 ? (
                            <ul className="list-disc list-inside text-sm text-blue-300 ml-4">
                                {highCardinality.map((col) => (
                                    <li key={col}>{col}: Acts like an ID; limited grouping possibilities.</li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-gray-400">No columns flagged as having extremely high cardinality (unique count &gt; 80% of total records).</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- NEW COMPONENT: Customer Segmentation Blueprint ---
const SegmentationBlueprint = ({ stats, correlations, bivariateData }) => {
    if (!stats) return <p className="text-center text-gray-400 p-4">Run analysis to build segmentation profiles.</p>;

    // 1. Identify the primary target metric (Price, Revenue, etc.) - Assume 'Price' or highest correlation
    const priceCorrs = correlations.filter(c => c.col1.toLowerCase().includes('price') || c.col2.toLowerCase().includes('price'));
    const priceDriver = priceCorrs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))[0]?.col1;
    
    // 2. Identify the highest-spending categorical group (Highest Mean in Price/Driver)
    let bestSegmentCategory = null;
    let highestMean = -Infinity;
    let highestMeanGroup = "N/A";

    Object.entries(bivariateData).forEach(([key, data]) => {
        // Look for price or primary driver relationships
        if (key.includes('_vs_Price') || key.includes(`_vs_${priceDriver}`)) {
            data.forEach(item => {
                const mean = parseFloat(item.mean);
                if (mean > highestMean) {
                    highestMean = mean;
                    bestSegmentCategory = key.split('_vs_')[0];
                    highestMeanGroup = item.category;
                }
            });
        }
    });

    // 3. Identify the largest market segment (Most frequent categorical mode)
    const largestMarketCol = Object.entries(stats).filter(([, s]) => s.type === 'categorical' && s.unique > 1).sort(([, a], [, b]) => parseFloat(b.unique) - parseFloat(a.unique))[0]?.[0];
    const largestMarketGroup = largestMarketCol ? stats[largestMarketCol].mode : "N/A";


    const SegmentCard = ({ title, profile, characteristics, action }) => (
        <div className="bg-slate-900 p-5 rounded-xl border border-emerald-500/30">
            <h4 className="text-xl font-bold text-emerald-400 mb-2 flex items-center gap-2">{title}</h4>
            <p className="text-lg font-medium text-white mb-3">Profile: <span className="text-yellow-300">{profile}</span></p>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-300 ml-4">
                <li>Key Driver: {characteristics.driver}</li>
                <li>Average Spend/Value: {characteristics.spend}</li>
                <li>Action: {action}</li>
            </ul>
        </div>
    );

    return (
        <div className="p-8 container mx-auto">
            <div className="bg-slate-800/70 p-6 rounded-xl border border-emerald-500/50 shadow-xl">
                <h2 className="text-3xl font-extrabold text-emerald-400 mb-6 flex items-center gap-2">
                    <Layers className="w-7 h-7" /> Customer Segmentation Blueprint
                </h2>
                <p className="text-gray-400 mb-6">
                    This blueprint synthesizes complex bivariate data into two actionable customer profiles based on value and volume.
                </p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Segment 1: High-Value/Premium Segment */}
                    <SegmentCard
                        title="💎 Premium Value Segment"
                        profile={`Customers where ${bestSegmentCategory || 'N/A'} is ${highestMeanGroup}`}
                        characteristics={{
                            driver: priceDriver ? `Price is strongly correlated with ${priceDriver} (r=${correlations.find(c => c.col1 === priceDriver)?.correlation.toFixed(2)})` : 'No strong driver identified.',
                            spend: highestMean !== -Infinity ? `Highest mean price/value found at ${highestMean.toFixed(0)}` : 'Data missing.',
                        }}
                        action={`Target this group with premium features, luxury, or high-end service. They drive the majority of revenue per unit.`}
                    />

                    {/* Segment 2: Volume/Core Market Segment */}
                    <SegmentCard
                        title="📈 Core Volume Segment"
                        profile={`Customers primarily defined by ${largestMarketCol || 'N/A'} being ${largestMarketGroup}`}
                        characteristics={{
                            driver: largestMarketCol ? `The dominant characteristic is ${largestMarketCol} (Mode: ${largestMarketGroup})` : 'No categorical modes found.',
                            spend: "This group provides scale and stability, though unit revenue may be lower.",
                        }}
                        action={`Focus marketing on affordability, comfort, and reliability. Ensure streamlined, high-volume production and delivery.`}
                    />
                </div>
            </div>
        </div>
    );
};

// --- NEW COMPONENT: Feature Importance and Predictive Blueprint ---
const FeatureImportanceSection = ({ stats, correlations, bivariateData }) => {
    if (!stats) return <p className="text-center text-gray-400 p-4">Run analysis to build the predictive blueprint.</p>;

    const numCols = Object.entries(stats).filter(([, s]) => s.type === 'numeric').map(([col]) => col);
    
    // Determine the Target Variable (Assume 'Price' or the highest mean variable if 'Price' isn't available)
    let targetVariable = numCols.find(col => col.toLowerCase().includes('price')) || numCols.find(col => col.toLowerCase().includes('salary'));
    if (!targetVariable) targetVariable = numCols.length > 0 ? numCols[0] : null;

    if (!targetVariable || numCols.length < 2) {
        return <p className="text-center text-red-300 p-4">Not enough numeric data to run predictive analysis. Need a clear target variable (e.g., Price/Salary).</p>;
    }


    // --- 1. Risk-Adjusted Predictors (Score = |Correlation| / CV) ---
    const riskAdjustedScores = numCols
        .filter(col => col !== targetVariable && stats[col]?.cv && parseFloat(stats[col].cv) !== 0)
        .map(col => {
            const corrObj = correlations.find(c => (c.col1 === col && c.col2 === targetVariable) || (c.col1 === targetVariable && c.col2 === col));
            const correlation = corrObj ? Math.abs(corrObj.correlation) : 0;
            const cv = parseFloat(stats[col].cv) / 100; // Convert CV% to decimal

            return {
                col,
                correlation: correlation.toFixed(2),
                cv: stats[col].cv,
                score: (correlation / cv).toFixed(3), // Score: Correlation / Inconsistency
            };
        })
        .sort((a, b) => parseFloat(b.score) - parseFloat(a.score))
        .slice(0, 5);


    // --- 2. Highest Leveraged Gain (Segments with Mean >> Median) ---
    const leveragedGains = Object.entries(bivariateData)
        .filter(([key]) => key.includes(`_vs_${targetVariable}`))
        .flatMap(([key, data]) => 
            data.filter(item => {
                const mean = parseFloat(item.mean);
                const median = parseFloat(item.median);
                const std = parseFloat(stats[targetVariable]?.std || 0);
                // Flag where Mean is significantly higher than Median (Right Skew)
                return (mean - median) > (0.2 * std) && mean > 0;
            }).map(item => ({
                segment: key.split('_vs_')[0],
                group: item.category,
                skewness: (parseFloat(item.mean) - parseFloat(item.median)).toFixed(0)
            }))
        )
        .sort((a, b) => parseFloat(b.skewness) - parseFloat(a.skewness))
        .slice(0, 3);
        
    // --- 3. Best Case vs Worst Case Profile ---
    let bestCase = { group: 'N/A', mean: -Infinity };
    let worstCase = { group: 'N/A', mean: Infinity };
    
    Object.entries(bivariateData).forEach(([key, data]) => {
        if (key.includes(`_vs_${targetVariable}`)) {
            data.forEach(item => {
                const mean = parseFloat(item.mean);
                if (mean > bestCase.mean) bestCase = { group: `${key.split('_vs_')[0]}: ${item.category}`, mean };
                if (mean < worstCase.mean && mean > 0) worstCase = { group: `${key.split('_vs_')[0]}: ${item.category}`, mean };
            });
        }
    });

    return (
        <div className="p-8 container mx-auto">
            <div className="bg-slate-800/70 p-6 rounded-xl border border-purple-500/50 shadow-xl">
                <h2 className="text-3xl font-extrabold text-purple-400 mb-6 flex items-center gap-2">
                    <TrendingUp className="w-7 h-7" /> Predictive Blueprint: Importance & Scenarios
                </h2>
                <p className="text-gray-400 mb-6">
                    Target Variable Identified: <strong className="text-yellow-300">{targetVariable}</strong>. This section identifies the variables most reliable for prediction and the segments that deliver outlier returns.
                </p>

                {/* --- 1. Risk-Adjusted Predictors Table --- */}
                <h3 className="text-2xl font-semibold text-purple-300 mb-4 border-b border-slate-700 pb-2">
                    1. Top Risk-Adjusted Predictors
                </h3>
                <p className="text-sm text-gray-400 mb-4">Variables with high correlation AND low inconsistency (CV). Ideal for robust predictive models.</p>
                
                <div className="overflow-x-auto mb-8">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead>
                            <tr className="bg-slate-700">
                                {['Feature', 'Score (Corr/CV)', 'Correlation', 'Inconsistency (CV%)', 'Action'].map(h => 
                                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-purple-200 uppercase tracking-wider">{h}</th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {riskAdjustedScores.map(item => (
                                <tr key={item.col} className="hover:bg-slate-700/50">
                                    <td className="px-6 py-4 whitespace-nowrap font-semibold text-white">{item.col}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-emerald-400 font-bold">{item.score}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{item.correlation}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-yellow-300">{item.cv}%</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">Use this for Model Feature Selection.</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* --- 2. Scenario Testing & Leveraged Gain --- */}
                <h3 className="text-2xl font-semibold text-purple-300 mb-4 border-b border-slate-700 pb-2">
                    2. Scenario Testing & Outlier Opportunities
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div className="p-4 bg-slate-900 rounded-lg border border-red-500/40">
                        <h4 className="text-lg font-semibold text-red-400 mb-2">Highest Leveraged Gain (Right-Skewed Segments)</h4>
                        <p className="text-sm text-gray-400 mb-3">Segments where a few high-value customers pull the mean far above the median (outlier revenue potential).</p>
                        <ul className="list-disc list-inside text-sm text-white ml-4 space-y-1">
                            {leveragedGains.map((g, i) => (
                                <li key={i} className="text-yellow-300">{g.segment} is {g.group} (Skew: +{g.skewness})</li>
                            ))}
                        </ul>
                    </div>

                    <div className="p-4 bg-slate-900 rounded-lg border border-cyan-500/40">
                        <h4 className="text-lg font-semibold text-cyan-400 mb-2">Best Case vs. Worst Case Profile</h4>
                        <p className="text-sm text-gray-400 mb-3">Clear profiles based on the highest and lowest mean {targetVariable} found.</p>
                        <ul className="list-inside space-y-2">
                            <li className="text-lg text-emerald-300">Best Case: {bestCase.group} (Avg {targetVariable}: {bestCase.mean.toFixed(0)})</li>
                            <li className="text-lg text-red-300">Worst Case: {worstCase.group} (Avg {targetVariable}: {worstCase.mean.toFixed(0)})</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};