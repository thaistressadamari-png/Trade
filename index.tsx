import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  deleteDoc, 
  setDoc,
  writeBatch 
} from "firebase/firestore";

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyDSx3oS0aIHx7s_6_SYd0BaZ8_VdRXmjOM",
  authDomain: "trade-b5646.firebaseapp.com",
  projectId: "trade-b5646",
  storageBucket: "trade-b5646.firebasestorage.app",
  messagingSenderId: "543317954174",
  appId: "1:543317954174:web:cdefd45e8b912bf8c3122f",
  measurementId: "G-BCB9EB5TYP"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

const tradesCollection = collection(db, 'trades');
const balancesCollection = collection(db, 'balances');
const depositsCollection = collection(db, 'deposits');

// --- Helper Functions ---
const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

const formatDollar = (value) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

const getYearMonth = (date) => {
  // Uses local time instead of UTC to avoid timezone issues (e.g. evening in Brazil -> next day UTC)
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}; 

const formatMonthYear = (monthStr) => { // "YYYY-MM"
  if (!monthStr || !monthStr.includes('-')) return '';
  const [year, month] = monthStr.split('-');
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};

const getAdjacentMonth = (monthStr, direction) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(Number(year), Number(month) - 1, 15); 
    date.setMonth(date.getMonth() + direction);
    return getYearMonth(date);
}

// --- Custom Hooks ---
const useIsMobile = (breakpoint = 768) => {
    const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < breakpoint);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [breakpoint]);

    return isMobile;
};

// --- Components ---
const DeleteConfirmationModal = ({ 
  onConfirm, 
  onCancel, 
  title = "Apagar Operação", 
  message = "Tem certeza que deseja apagar esta operação? Esta ação não pode ser desfeita." 
}) => (
  <div className="modal-backdrop" onClick={onCancel} style={{zIndex: 50}}>
    <div className="modal-content" style={{maxWidth: '350px'}} onClick={(e) => e.stopPropagation()}>
      <h2>{title}</h2>
      <p style={{color: '#a0a0a0', marginBottom: '1.5rem'}}>{message}</p>
      <div className="modal-actions">
        <button onClick={onCancel} className="btn-secondary">Cancelar</button>
        <button onClick={onConfirm} className="btn-danger"><i className="ph-fill ph-trash"></i> Apagar</button>
      </div>
    </div>
  </div>
);

const InitialBalanceModal = ({ month, onSave, initialValue }) => {
  const [balance, setBalance] = useState(initialValue ?? '');
  
  const handleSave = () => {
    const value = parseFloat(balance);
    if (!isNaN(value) && value >= 0) {
      onSave(value);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <h2>Banca Inicial para {formatMonthYear(month)}</h2>
        <p>Por favor, insira o valor inicial da sua banca para este mês.</p>
        <div className="input-group">
          <label htmlFor="initial-balance">Valor da Banca ($)</label>
          <input
            id="initial-balance"
            type="number"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            placeholder="Ex: 5000.00"
            autoFocus
          />
        </div>
        <button onClick={handleSave}><i className="ph-fill ph-check-circle"></i> Salvar</button>
      </div>
    </div>
  );
};

const DepositsModal = ({ month, deposits, onAddDeposit, onDeleteDeposit, onClose }) => {
    const [value, setValue] = useState('');
    const [date, setDate] = useState(() => {
        const d = new Date();
        const year = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        // Default to today if within current month, otherwise default to 1st of selected month
        if (`${year}-${m}` === month) return `${year}-${m}-${day}`;
        return `${month}-01`;
    });
    const [depositToDelete, setDepositToDelete] = useState(null);

    const handleSubmit = (e) => {
        e.preventDefault();
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && numValue > 0) {
            onAddDeposit({
                date,
                value: numValue,
                month: date.substring(0, 7) // Store month key for easier filtering
            });
            setValue('');
        }
    };

    const handleConfirmDelete = () => {
        if (depositToDelete) {
            onDeleteDeposit(depositToDelete);
            setDepositToDelete(null);
        }
    };

    const monthDeposits = deposits.filter(d => d.month === month || d.date.startsWith(month));
    const totalDeposits = monthDeposits.reduce((acc, d) => acc + d.value, 0);

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Aportes de {formatMonthYear(month)}</h2>
                    <button className="close-btn" onClick={onClose}><i className="ph-bold ph-x"></i></button>
                </div>

                <div className="summary-card" style={{marginBottom: '1.5rem', textAlign: 'center', borderColor: 'var(--primary-green)'}}>
                    <span style={{color: 'var(--text-secondary)', fontSize: '0.9rem'}}>Total Aportado</span>
                    <strong style={{display: 'block', fontSize: '1.5rem', color: 'var(--primary-green)'}}>
                        {formatCurrency(totalDeposits)}
                    </strong>
                </div>

                <form onSubmit={handleSubmit} style={{marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border-color)'}}>
                    <div className="input-group">
                        <label>Data do Aporte</label>
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                    </div>
                    <div className="input-group">
                        <label>Valor ($)</label>
                        <input 
                            type="number" 
                            step="any" 
                            value={value} 
                            onChange={(e) => setValue(e.target.value)} 
                            placeholder="Ex: 100.00"
                            required 
                        />
                    </div>
                    <button type="submit" style={{width: '100%'}}>
                        <i className="ph-bold ph-plus"></i> Adicionar Aporte
                    </button>
                </form>

                <div className="deposits-list">
                    <h3 style={{fontSize: '1rem', marginBottom: '0.5rem'}}>Histórico</h3>
                    {monthDeposits.length === 0 ? (
                        <p style={{color: 'var(--text-secondary)', fontSize: '0.9rem'}}>Nenhum aporte registrado.</p>
                    ) : (
                        <ul className="trade-list" style={{maxHeight: '200px', overflowY: 'auto'}}>
                            {monthDeposits.map(deposit => (
                                <li key={deposit.id} className="trade-item" style={{gridTemplateColumns: '1fr 1fr auto'}}>
                                    <span>{new Date(deposit.date).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</span>
                                    <span className="profit">{formatCurrency(deposit.value)}</span>
                                    <button className="delete-btn" onClick={() => setDepositToDelete(deposit.id)}>
                                        <i className="ph-bold ph-trash"></i>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {depositToDelete && (
                    <DeleteConfirmationModal 
                        title="Apagar Aporte"
                        message="Tem certeza que deseja apagar este aporte?"
                        onConfirm={handleConfirmDelete} 
                        onCancel={() => setDepositToDelete(null)} 
                    />
                )}
            </div>
        </div>
    );
};

const FinalBalanceModal = ({ month, initialBalance, dailyData, dailyDeposits, finalBalance, allTrades, allBalances, onClose }) => {
    const chartRef = useRef(null);
    const chartInstance = useRef(null);
    const [viewMode, setViewMode] = useState('month'); // 'month' or 'year'
    
    // Initialize from localStorage or default to 5.50
    const [exchangeRate, setExchangeRate] = useState(() => {
        const saved = localStorage.getItem('exchangeRate');
        return saved ? parseFloat(saved) : 5.50;
    });

    // Save to localStorage whenever it changes
    useEffect(() => {
        localStorage.setItem('exchangeRate', exchangeRate.toString());
    }, [exchangeRate]);

    // Calculate cumulative balance data
    const chartData = useMemo(() => {
        const [currentYear, currentMonth] = month.split('-');

        if (viewMode === 'month') {
            // MONTHLY VIEW (Daily evolution)
            const daysInMonth = new Date(Number(currentYear), Number(currentMonth), 0).getDate();
            const labels = Array.from({ length: daysInMonth }, (_, i) => i + 1);
            
            let runningBalance = initialBalance;
            const data = labels.map(day => {
                // Add Profit/Loss for the day
                runningBalance += (dailyData[day] || 0);
                // Add Deposits for the day
                runningBalance += (dailyDeposits[day] || 0);
                return runningBalance;
            });
            
            return { labels, data, title: `Evolução em ${formatMonthYear(month)}` };
        } else {
            // YEARLY VIEW (Monthly evolution)
            const months = [
                "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
                "Jul", "Ago", "Set", "Out", "Nov", "Dez"
            ];
            
            const data = [];
            
            months.forEach((_, index) => {
                const monthIndex = index + 1;
                const monthStr = `${currentYear}-${monthIndex.toString().padStart(2, '0')}`;
                
                // For simplicity in Year view, we approximate using recorded initial balances + trades + deposits would be complex.
                // We will stick to the previous logic: Start Balance of Month + Profit of Month.
                // Note: Ideally, Year view should chain months, but without full historical data linking, 
                // we rely on the `allBalances` (Initial Balance) being set correctly for each month.
                
                let monthStartBalance = allBalances[monthStr] || 0;
                
                // Calculate profit for this specific month
                const monthlyTrades = allTrades.filter(t => t.date.startsWith(monthStr));
                const monthlyProfit = monthlyTrades.reduce((acc, t) => acc + t.result, 0);
                
                // We technically should add deposits here if the "End Balance" is what we want.
                // However, usually "Evolution" tracks the bankroll state. 
                // If the user updated the next month's Initial Balance correctly, it implicitly includes previous month's deposits.
                // But let's add deposits for visual consistency if we are plotting "End of Month" result.
                // For now, let's keep it simple: Start + Profit. If they made a deposit, they should have updated the next month's Start Balance.
                
                data.push(monthStartBalance + monthlyProfit);
            });

            return { labels: months, data, title: `Evolução em ${currentYear}` };
        }
    }, [month, initialBalance, dailyData, dailyDeposits, viewMode, allTrades, allBalances]);

    useEffect(() => {
        if (chartRef.current) {
            const ctx = chartRef.current.getContext('2d');
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }

            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, 'rgba(40, 167, 69, 0.5)');
            gradient.addColorStop(1, 'rgba(40, 167, 69, 0.0)');

            chartInstance.current = new (window as any).Chart(ctx, {
                type: 'line',
                data: {
                    labels: chartData.labels,
                    datasets: [{
                        label: 'Banca',
                        data: chartData.data,
                        borderColor: '#28a745',
                        backgroundColor: gradient,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: '#28a745'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            grid: { color: 'rgba(255, 255, 255, 0.1)' },
                            ticks: { color: '#e0e0e0' }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: '#e0e0e0' }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (context) => formatCurrency(context.raw)
                            },
                            displayColors: false,
                            backgroundColor: 'rgba(0,0,0,0.8)',
                            titleColor: '#fff',
                            bodyColor: '#fff',
                            padding: 10,
                            cornerRadius: 8,
                        },
                        // Explicitly disable datalabels for this chart to avoid clutter
                        datalabels: {
                            display: false
                        }
                    }
                }
            });

            return () => {
                if (chartInstance.current) {
                    chartInstance.current.destroy();
                }
            };
        }
    }, [chartData]);

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Evolução da Banca</h2>
                    <button className="close-btn" onClick={onClose}><i className="ph-bold ph-x"></i></button>
                </div>
                
                <div style={{display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '1.5rem'}}>
                    <button 
                        onClick={() => setViewMode('month')} 
                        className={viewMode === 'month' ? '' : 'btn-secondary'}
                        style={{fontSize: '0.9rem', padding: '0.5rem 1rem'}}
                    >
                        Visão Mensal ({formatMonthYear(month)})
                    </button>
                    <button 
                        onClick={() => setViewMode('year')} 
                        className={viewMode === 'year' ? '' : 'btn-secondary'}
                        style={{fontSize: '0.9rem', padding: '0.5rem 1rem'}}
                    >
                        Visão Anual ({month.split('-')[0]})
                    </button>
                </div>

                <div className="balance-conversion-row">
                    <div className="conversion-card">
                        <span className="label">Banca Atual</span>
                        <span className="value profit">{formatCurrency(finalBalance)}</span>
                    </div>
                    <div className="conversion-operator">
                        <i className="ph-bold ph-arrows-left-right"></i>
                    </div>
                    <div className="conversion-card">
                        <label htmlFor="rate">Cotação Dólar (R$)</label>
                        <input 
                            id="rate"
                            type="number" 
                            step="0.01" 
                            value={exchangeRate} 
                            onChange={(e) => setExchangeRate(parseFloat(e.target.value))} 
                        />
                    </div>
                    <div className="conversion-operator">
                        <i className="ph-bold ph-equals"></i>
                    </div>
                    <div className="conversion-card highlight">
                        <span className="label">Valor em Reais (R$)</span>
                        <span className="value">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(finalBalance * exchangeRate)}</span>
                    </div>
                </div>

                <div className="line-chart-container">
                    <canvas ref={chartRef}></canvas>
                </div>
            </div>
        </div>
    );
};

const MonthYearPickerModal = ({ currentMonth, onSelect, onClose }) => {
  const [displayYear, setDisplayYear] = useState(new Date(currentMonth + '-15').getFullYear());
  const currentYearMonth = getYearMonth(new Date());

  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  const handleSelectMonth = (monthIndex) => {
    const month = (monthIndex + 1).toString().padStart(2, '0');
    onSelect(`${displayYear}-${month}`);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="month-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="month-picker-header">
          <button onClick={() => setDisplayYear(displayYear - 1)} aria-label="Ano anterior">
             <i className="ph-bold ph-caret-left"></i>
          </button>
          <span>{displayYear}</span>
          <button onClick={() => setDisplayYear(displayYear + 1)} aria-label="Próximo ano">
             <i className="ph-bold ph-caret-right"></i>
          </button>
        </div>
        <div className="month-grid">
          {months.map((monthName, index) => {
            const monthStr = `${displayYear}-${(index + 1).toString().padStart(2, '0')}`;
            const isSelected = monthStr === currentMonth;
            const isCurrent = monthStr === currentYearMonth;
            let className = 'month-btn';
            if (isSelected) className += ' selected';
            if (isCurrent && !isSelected) className += ' current';
            return (
              <button key={monthName} className={className} onClick={() => handleSelectMonth(index)}>
                {monthName.substring(0,3)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const DailyPlanner = ({ currentBalance }) => {
    // Persist settings in localStorage (User preferences can stay local)
    const [goalPercent, setGoalPercent] = useState(() => parseFloat(localStorage.getItem('planner_goalPercent') || '3'));
    const [tradeCount, setTradeCount] = useState(() => parseInt(localStorage.getItem('planner_tradeCount') || '2'));
    const [lossPercent, setLossPercent] = useState(() => parseFloat(localStorage.getItem('planner_lossPercent') || '3'));
  
    useEffect(() => {
        localStorage.setItem('planner_goalPercent', goalPercent.toString());
        localStorage.setItem('planner_tradeCount', tradeCount.toString());
        localStorage.setItem('planner_lossPercent', lossPercent.toString());
    }, [goalPercent, tradeCount, lossPercent]);
  
    const bankroll = currentBalance || 0;
    const goalValue = bankroll * (goalPercent / 100);
    const lossValue = bankroll * (lossPercent / 100);
    const goalPerTrade = tradeCount > 0 ? goalValue / tradeCount : 0;
  
    return (
        <div className="daily-planner-card">
            <div className="planner-header">
              <h3><i className="ph-fill ph-target"></i> Metas Diárias</h3>
            </div>
            
            <div className="planner-content">
                <div className="planner-inputs">
                    <div className="input-wrapper">
                        <label>Meta Lucro (%)</label>
                        <input type="number" step="0.1" value={goalPercent} onChange={e => setGoalPercent(parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="input-wrapper">
                        <label>Stop Loss (%)</label>
                        <input type="number" step="0.1" value={lossPercent} onChange={e => setLossPercent(parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="input-wrapper">
                        <label>Qtd. Operações</label>
                        <div className="stepper-input">
                          <button type="button" onClick={() => setTradeCount(Math.max(1, tradeCount - 1))}>-</button>
                          <span>{tradeCount}</span>
                          <button type="button" onClick={() => setTradeCount(tradeCount + 1)}>+</button>
                        </div>
                    </div>
                </div>
      
                <div className="planner-results">
                    <div className="result-card profit">
                        <span>Meta Total</span>
                        <strong>{formatCurrency(goalValue)}</strong>
                    </div>
                    <div className="result-card loss">
                        <span>Stop Loss</span>
                        <strong>{formatCurrency(lossValue)}</strong>
                    </div>
                    <div className="result-card neutral">
                        <span>Por Operação ({tradeCount}x)</span>
                        <strong>{formatCurrency(goalPerTrade)}</strong>
                    </div>
                </div>
            </div>
        </div>
    )
};

const MonthSelector = ({ selectedMonth, setSelectedMonth, onOpenPicker }) => (
    <div className="month-selector">
        <button onClick={() => setSelectedMonth(getAdjacentMonth(selectedMonth, -1))} aria-label="Mês anterior">
            <i className="ph-bold ph-caret-left"></i>
        </button>
        <button className="month-display-btn" onClick={onOpenPicker}>
          <h3>{formatMonthYear(selectedMonth)}</h3>
        </button>
        <button onClick={() => setSelectedMonth(getAdjacentMonth(selectedMonth, 1))} aria-label="Próximo mês">
            <i className="ph-bold ph-caret-right"></i>
        </button>
    </div>
);

const SummaryCard = ({icon, title, value, className = '', onEdit = undefined, onClick = undefined}) => (
    <div className={`summary-card ${onClick ? 'clickable' : ''}`} onClick={onClick}>
        <div className="card-header">
            <div className="card-title">
                <i className={`ph-fill ph-${icon}`}></i>
                <span>{title}</span>
            </div>
            {onEdit && (
                <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="edit-btn" aria-label="Editar valor">
                    <i className="ph-bold ph-pencil-simple"></i>
                </button>
            )}
        </div>
        <p className={className}>{value}</p>
    </div>
);

const MobileDailySummary = ({ dailyData, selectedMonth }) => {
    const daysWithTrades = Object.keys(dailyData).map(Number).sort((a, b) => a - b);

    if (daysWithTrades.length === 0) {
        return (
            <div className="mobile-chart-placeholder">
                <i className="ph-fill ph-chart-bar"></i>
                <p>Nenhum resultado diário para exibir em {formatMonthYear(selectedMonth)}.</p>
            </div>
        );
    }

    return (
        <div className="mobile-chart-container">
            <h4>Resultado Diário</h4>
            <div className="scrollable-days">
                {daysWithTrades.map(day => {
                    const result = dailyData[day];
                    const isProfit = result >= 0;
                    return (
                        <div key={day} className={`day-card ${isProfit ? 'profit-bg' : 'loss-bg'}`}>
                            <span className="day-label">Dia {day}</span>
                            <span className={`day-result ${isProfit ? 'profit' : 'loss'}`}>{formatCurrency(result)}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const Dashboard = ({ 
  selectedMonth, 
  setSelectedMonth, 
  trades, 
  balances, 
  deposits,
  initialBalance, 
  onEditBalance, 
  onOpenMonthPicker,
  onAddDeposit,
  onDeleteDeposit
}) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const isMobile = useIsMobile();
  const [showFinalModal, setShowFinalModal] = useState(false);
  const [showDepositsModal, setShowDepositsModal] = useState(false);
  
  const monthTrades = useMemo(() => trades.filter(t => t.date.substring(0, 7) === selectedMonth), [trades, selectedMonth]);
  const monthDeposits = useMemo(() => deposits.filter(d => d.date.substring(0, 7) === selectedMonth), [deposits, selectedMonth]);

  const monthlyProfit = monthTrades.reduce((acc, trade) => acc + trade.result, 0);
  const totalDeposits = monthDeposits.reduce((acc, d) => acc + d.value, 0);
  
  // Calculate Profit Percentage based on (Initial + Deposits) or just Initial? 
  // Usually ROI is based on starting capital. Let's stick to Initial for ROI to check performance against the start.
  // Alternatively, we could do (Profit / (Initial + Deposits)). Let's stick to Initial for now as "Base".
  const profitPercentage = initialBalance > 0 ? (monthlyProfit / initialBalance) * 100 : 0;
  
  const finalBalance = initialBalance + totalDeposits + monthlyProfit;

  const dailyData = useMemo(() => {
    return monthTrades.reduce((acc, trade) => {
        const day = new Date(trade.date).getUTCDate();
        acc[day] = (acc[day] || 0) + trade.result;
        return acc;
      }, {});
  }, [monthTrades]);

  // Aggregate daily deposits for the chart
  const dailyDepositsData = useMemo(() => {
    return monthDeposits.reduce((acc, d) => {
        const day = new Date(d.date).getUTCDate();
        acc[day] = (acc[day] || 0) + d.value;
        return acc;
    }, {});
  }, [monthDeposits]);

  useEffect(() => {
    if (!isMobile && chartRef.current) {
      const [year, month] = selectedMonth.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      const labels = Array.from({ length: daysInMonth }, (_, i) => i + 1);
      const data = labels.map(day => dailyData[day] || 0);

      const ctx = chartRef.current.getContext('2d');
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
      
      const profitGradient = ctx.createLinearGradient(0, 0, 0, 300);
      profitGradient.addColorStop(0, 'rgba(40, 167, 69, 0.7)');
      profitGradient.addColorStop(1, 'rgba(40, 167, 69, 0.1)');
      
      const lossGradient = ctx.createLinearGradient(0, 0, 0, 300);
      lossGradient.addColorStop(0, 'rgba(220, 53, 69, 0.7)');
      lossGradient.addColorStop(1, 'rgba(220, 53, 69, 0.1)');

      if ((window as any).ChartDataLabels) {
          (window as any).Chart.register((window as any).ChartDataLabels);
      }

      chartInstance.current = new (window as any).Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Lucro/Prejuízo Diário ($)',
            data,
            backgroundColor: data.map(v => v >= 0 ? profitGradient : lossGradient),
            borderColor: data.map(v => v >= 0 ? 'rgba(40, 167, 69, 1)' : 'rgba(220, 53, 69, 1)'),
            borderWidth: 1,
            borderRadius: 4,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: {
            padding: {
                top: 25,
                bottom: 25
            }
          },
          scales: {
            y: { 
                beginAtZero: true, 
                grid: { color: 'rgba(255, 255, 255, 0.1)'},
                ticks: { color: '#e0e0e0' }
            },
            x: {
                grid: { display: false },
                ticks: { color: '#e0e0e0' }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (context) => `Resultado: ${formatCurrency(context.raw as number)}`
              }
            },
            datalabels: {
              anchor: 'end',
              align: 'end',
              offset: 0,
              formatter: (value) => value !== 0 ? formatCurrency(value) : null,
              color: '#e0e0e0',
              font: {
                size: 10,
                weight: 'bold'
              },
              display: 'auto'
            }
          }
        },
      });

      return () => {
          if ((window as any).ChartDataLabels) {
            (window as any).Chart.unregister((window as any).ChartDataLabels);
          }
      }
    }
  }, [dailyData, selectedMonth, isMobile]);

  return (
    <div className="container">
      <DailyPlanner currentBalance={finalBalance} />
      
      <div className="separator" style={{margin: '2.5rem 0', borderBottom: '1px solid var(--border-color)'}}></div>
      
      <h2>Resumo das Operações</h2>
      <MonthSelector 
        selectedMonth={selectedMonth} 
        setSelectedMonth={setSelectedMonth} 
        onOpenPicker={onOpenMonthPicker} 
      />
      <div className="summary-grid">
        <SummaryCard icon="bank" title="Banca Inicial" value={formatCurrency(initialBalance)} onEdit={onEditBalance} />
        
        <SummaryCard 
            icon="piggy-bank" 
            title="Aportes" 
            value={formatCurrency(totalDeposits)} 
            onClick={() => setShowDepositsModal(true)}
            className="clickable-value profit"
        />

        <SummaryCard icon="chart-line-up" title="Lucro/Prejuízo" value={formatCurrency(monthlyProfit)} className={monthlyProfit >= 0 ? 'profit' : 'loss'} />
        <SummaryCard icon="percent" title="% Lucro Mensal" value={`${profitPercentage.toFixed(2)}%`} className={profitPercentage >= 0 ? 'profit' : 'loss'} />
        
        <SummaryCard 
            icon="wallet" 
            title="Banca Final" 
            value={formatCurrency(finalBalance)} 
            onClick={() => setShowFinalModal(true)}
            className="clickable-value"
        />
      </div>
      <div className="chart-container">
        {isMobile ? (
            <MobileDailySummary dailyData={dailyData} selectedMonth={selectedMonth} />
        ) : (
            <canvas ref={chartRef}></canvas>
        )}
      </div>

      {showDepositsModal && (
          <DepositsModal 
            month={selectedMonth}
            deposits={deposits}
            onAddDeposit={onAddDeposit}
            onDeleteDeposit={onDeleteDeposit}
            onClose={() => setShowDepositsModal(false)}
          />
      )}

      {showFinalModal && (
          <FinalBalanceModal 
            month={selectedMonth}
            initialBalance={initialBalance}
            dailyData={dailyData}
            dailyDeposits={dailyDepositsData}
            finalBalance={finalBalance}
            allTrades={trades}
            allBalances={balances}
            onClose={() => setShowFinalModal(false)}
          />
      )}
    </div>
  );
};

const TradeForm = ({ addTrade }) => {
  // Use local date instead of UTC to avoid date skipping ahead in evenings
  const getLocalToday = () => {
      const d = new Date();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
  };

  const [date, setDate] = useState(getLocalToday());
  const [asset, setAsset] = useState('');
  const [result, setResult] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Basic validation to ensure we don't save empty strings, though HTML required attribute handles it too.
    if (result === '' || result === null || result === undefined) return;
    
    const numericResult = parseFloat(result);
    if (isNaN(numericResult)) {
        alert('Por favor, insira um valor numérico válido.');
        return;
    }

    addTrade({
      id: Date.now(), // Temporary ID, will be ignored by Firebase logic
      date,
      asset,
      result: numericResult,
    });
    // Keep date as is for multiple entries on same day, clears others
    setAsset('');
    setResult('');
  };
  
  const setToday = () => {
      setDate(getLocalToday());
  }

  const openDatePicker = (e) => {
      // Prevent default label behavior if clicked from label to avoid conflict
      if (e.target.tagName === 'LABEL') {
          e.preventDefault();
      }
      
      const input = document.getElementById('date');
      if (input) {
          try {
              if (typeof (input as any).showPicker === 'function') {
                  (input as any).showPicker();
              } else {
                  input.focus();
              }
          } catch (err) {
              console.log('Calendar picker error:', err);
              input.focus();
          }
      }
  }

  return (
    <div className="container" style={{marginBottom: '1rem'}}>
      <h2>Registrar nova operação</h2>
      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <label htmlFor="date" onClick={openDatePicker} style={{cursor: 'pointer'}}>Data</label>
          <div className="date-input-wrapper">
            <input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                style={{cursor: 'pointer'}}
            />
            <button type="button" onClick={setToday} className="small-btn">
                Hoje
            </button>
          </div>
        </div>
        <div className="input-group">
          <label htmlFor="asset">Ativo (opcional)</label>
          <input
            id="asset"
            type="text"
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            placeholder="Ex: WINFUT"
          />
        </div>
        <div className="input-group">
          <label htmlFor="result">Resultado ($)</label>
          <input
            id="result"
            type="number"
            step="any"
            value={result}
            onChange={(e) => setResult(e.target.value)}
            placeholder="Ex: 57.92 ou -10.00"
            required
          />
        </div>
        <button type="submit" style={{width: '100%'}}>
            <i className="ph-fill ph-floppy-disk"></i> Salvar Operação
        </button>
      </form>
    </div>
  );
};

const TradeList = ({ trades, onDeleteRequest, selectedMonth }) => {
    const monthTrades = trades
        .filter(t => t.date.substring(0, 7) === selectedMonth)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if(monthTrades.length === 0) {
        return <p style={{textAlign: 'center', marginTop: '2rem', color: 'var(--text-secondary)'}}>Nenhuma operação registrada para este mês.</p>
    }

    return (
        <div className="container" style={{marginTop: '1rem'}}>
            <h3>Operações de {formatMonthYear(selectedMonth)}</h3>
            <ul className="trade-list">
                {monthTrades.map(trade => (
                    <li key={trade.id} className="trade-item">
                        <span>{new Date(trade.date).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</span>
                        <span>{trade.asset || 'N/A'}</span>
                        <span className={trade.result >= 0 ? 'profit' : 'loss'}>
                            {formatCurrency(trade.result)}
                        </span>
                        <button className="delete-btn" onClick={() => onDeleteRequest(trade.id)} aria-label="Apagar operação">
                           <i className="ph-bold ph-trash"></i>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    )
}

const Settings = ({ trades, onImport }) => {
  const [dragActive, setDragActive] = useState(false);

  const handleExport = () => {
    if (!(window as any).XLSX) {
        alert('Erro: Biblioteca de exportação não carregada. Tente recarregar a página.');
        return;
    }
    
    const XLSX = (window as any).XLSX;
    const wb = XLSX.utils.book_new();
    
    const tradesByMonth = {};
    
    trades.forEach(t => {
        const month = t.date.substring(0, 7);
        if (!tradesByMonth[month]) tradesByMonth[month] = [];
        tradesByMonth[month].push(t);
    });
    
    const sortedMonths = Object.keys(tradesByMonth).sort().reverse();

    if (sortedMonths.length === 0) {
        alert("Não há dados para exportar.");
        return;
    }

    sortedMonths.forEach(month => {
        const monthTrades = tradesByMonth[month];
        monthTrades.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        const totalProfit = monthTrades.reduce((acc, t) => acc + t.result, 0);

        const sheetData = [
            ['Mês Ref.', formatMonthYear(month)],
            ['Resultado Mês', totalProfit],
            [],
            ['Data', 'Ativo', 'Resultado']
        ];

        monthTrades.forEach(t => {
            sheetData.push([t.date, t.asset || '', t.result]);
        });

        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        ws['!cols'] = [{wch: 15}, {wch: 15}, {wch: 15}];
        XLSX.utils.book_append_sheet(wb, ws, month);
    });

    const fileName = `TradeTracker_Completo_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const handleFile = (file) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const data = event.target?.result;
      if (!data) return;

      const XLSX = (window as any).XLSX;
      
      let workbook;
      try {
          workbook = XLSX.read(data, { type: 'array' });
      } catch (error) {
          console.error(error);
          alert('Erro ao ler o arquivo. Certifique-se de que é um arquivo válido (.csv ou .xlsx).');
          return;
      }

      const newTrades = [];

      workbook.SheetNames.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          // Use raw: false to ensure we get strings for pattern matching, consistent with CSV
          const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

          if (!rows || rows.length === 0) return;

          let headerIdx = -1;
          let dateColIdx = -1;
          let assetColIdx = -1;
          let resultColIdx = -1;

          // Try to find a header row in first 20 rows
          for (let i = 0; i < Math.min(rows.length, 20); i++) {
             const row = rows[i];
             if (!Array.isArray(row)) continue;
             const rowStr = row.join(' ').toLowerCase();
             
             if ((rowStr.includes('data') || rowStr.includes('date')) && (rowStr.includes('resultado') || rowStr.includes('result'))) {
                 headerIdx = i;
                 row.forEach((cell, idx) => {
                     const c = String(cell).toLowerCase().trim();
                     if (c === 'data' || c === 'date') dateColIdx = idx;
                     else if (c === 'ativo' || c === 'asset') assetColIdx = idx;
                     else if (c.includes('resultado') || c.includes('result')) resultColIdx = idx;
                 });
                 break;
             }
          }

          if (headerIdx === -1) {
              dateColIdx = 0;
              assetColIdx = 1;
              resultColIdx = 2;
              if (rows.length > 0 && Array.isArray(rows[0])) {
                  const r0 = rows[0].map(c => String(c).toLowerCase());
                  if (r0.some(c => c.includes('data') || c.includes('date'))) {
                      headerIdx = 0;
                  }
              }
          }

          const startRow = headerIdx === -1 ? 0 : headerIdx + 1;

          for (let i = startRow; i < rows.length; i++) {
              const row = rows[i];
              if (!Array.isArray(row) || row.length === 0) continue;

              let dateStr = row[dateColIdx];
              let assetStr = assetColIdx !== -1 ? row[assetColIdx] : '';
              let resultStr = row[resultColIdx];

              if (!dateStr || resultStr === undefined || resultStr === null || resultStr === '') continue;
              
              dateStr = String(dateStr).trim();
              resultStr = String(resultStr).trim();

              let finalDate = '';
              
              // Remove potential time "2024-10-10 12:00"
              const cleanDateStr = dateStr.split(' ')[0];

              // ISO YYYY-MM-DD
              if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDateStr)) {
                  finalDate = cleanDateStr;
              } else {
                  // Try DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
                  const parts = cleanDateStr.split(/[\/\-\.]/);
                  if (parts.length === 3) {
                      // YYYY/MM/DD
                      if (parts[0].length === 4) {
                          finalDate = `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
                      } 
                      // DD/MM/YYYY
                      else if (parts[2].length === 4) {
                          finalDate = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
                      }
                      // DD/MM/YY (Assume 20xx)
                      else if (parts[2].length === 2) {
                          finalDate = `20${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
                      }
                  }
                  
                  if (!finalDate) {
                      const d = new Date(dateStr);
                      if (!isNaN(d.getTime())) finalDate = d.toISOString().split('T')[0];
                  }
              }

              let cleanResult = resultStr.replace(/[^\d.,-]/g, '');
              if (cleanResult.includes(',') && cleanResult.includes('.')) {
                  if (cleanResult.lastIndexOf(',') > cleanResult.lastIndexOf('.')) {
                       cleanResult = cleanResult.replace(/\./g, '').replace(',', '.');
                  } else {
                       cleanResult = cleanResult.replace(/,/g, '');
                  }
              } else if (cleanResult.includes(',')) {
                  cleanResult = cleanResult.replace(',', '.');
              }
              
              const resultVal = parseFloat(cleanResult);

              if (finalDate && !isNaN(resultVal)) {
                  newTrades.push({
                      id: Date.now() + Math.random() + newTrades.length,
                      date: finalDate,
                      asset: String(assetStr).trim(),
                      result: resultVal
                  });
              }
          }
      });

      if (newTrades.length > 0) {
        onImport(newTrades);
        alert(`${newTrades.length} operações importadas com sucesso!`);
      } else {
          alert('Nenhuma operação válida encontrada. Verifique se o arquivo contém as colunas Data e Resultado.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="container">
      <h2>Configurações de Dados</h2>
      <div className="settings-grid">
          <div className="setting-card">
              <i className="ph-duotone ph-file-xls"></i>
              <h3>Exportar Planilha (Excel)</h3>
              <p>Baixe seus dados em formato .xlsx.</p>
              <button onClick={handleExport}>
                  <i className="ph-fill ph-download-simple"></i> Baixar Excel
              </button>
          </div>
          
          <div 
            className={`setting-card ${dragActive ? 'drag-active' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
              <i className="ph-duotone ph-upload-simple"></i>
              <h3>Importar Dados</h3>
              <p>Arraste e solte seu arquivo aqui<br/>ou clique para selecionar (CSV ou Excel)</p>
              <label htmlFor="file-upload" className="file-upload-btn">
                  <i className="ph-fill ph-file-plus"></i> Selecionar Arquivo
              </label>
              <input 
                id="file-upload" 
                type="file" 
                accept=".csv, .xlsx, .xls" 
                onChange={handleFileChange} 
                style={{display: 'none'}}
              />
          </div>
      </div>
    </div>
  );
}

const BottomNav = ({ page, setPage }) => (
  <nav className="bottom-nav">
    <button 
      className={page === 'dashboard' ? 'active' : ''} 
      onClick={() => setPage('dashboard')}
    >
      <i className="ph-fill ph-layout"></i>
      <span>Dashboard</span>
    </button>
    <button 
      className={page === 'lancamentos' ? 'active' : ''} 
      onClick={() => setPage('lancamentos')}
    >
      <i className="ph-fill ph-plus-circle"></i>
      <span>Lançamentos</span>
    </button>
    <button 
      className={page === 'configuracoes' ? 'active' : ''} 
      onClick={() => setPage('configuracoes')}
    >
      <i className="ph-fill ph-gear"></i>
      <span>Ajustes</span>
    </button>
  </nav>
);

const Header = ({ page, setPage }) => {
  const isMobile = useIsMobile();
  
  return (
    <header>
      <h1><i className="ph-fill ph-chart-line-up"></i> Trade Tracker</h1>
      {!isMobile && (
        <nav>
          <button className={page === 'dashboard' ? 'active' : ''} onClick={() => setPage('dashboard')}>
              <i className="ph-fill ph-layout"></i> Dashboard
          </button>
          <button className={page === 'lancamentos' ? 'active' : ''} onClick={() => setPage('lancamentos')}>
              <i className="ph-fill ph-plus-circle"></i> Lançamentos
          </button>
          <button className={page === 'configuracoes' ? 'active' : ''} onClick={() => setPage('configuracoes')}>
              <i className="ph-fill ph-gear"></i> Configurações
          </button>
        </nav>
      )}
    </header>
  );
};


const App = () => {
  const [page, setPage] = useState('dashboard');
  const [trades, setTrades] = useState([]);
  const [balances, setBalances] = useState({});
  const [deposits, setDeposits] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(getYearMonth(new Date()));
  const [showModal, setShowModal] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [tradeToDelete, setTradeToDelete] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const isMobile = useIsMobile();

  const initialBalanceForMonth = useMemo(() => balances[selectedMonth], [balances, selectedMonth]);
  
  // --- Load Data from Firebase ---
  useEffect(() => {
      const loadData = async () => {
          try {
              // Fetch Trades
              const tradesSnapshot = await getDocs(tradesCollection);
              const loadedTrades = tradesSnapshot.docs.map(doc => ({
                  id: doc.id,
                  ...doc.data()
              }));
              setTrades(loadedTrades);

              // Fetch Balances
              const balancesSnapshot = await getDocs(balancesCollection);
              const loadedBalances = {};
              balancesSnapshot.docs.forEach(doc => {
                  loadedBalances[doc.id] = doc.data().value;
              });
              setBalances(loadedBalances);

              // Fetch Deposits
              const depositsSnapshot = await getDocs(depositsCollection);
              const loadedDeposits = depositsSnapshot.docs.map(doc => ({
                  id: doc.id,
                  ...doc.data()
              }));
              setDeposits(loadedDeposits);

          } catch (error) {
              console.error("Error loading data from Firebase:", error);
              alert("Erro ao carregar dados. Verifique sua conexão.");
          } finally {
              setLoading(false);
          }
      };

      loadData();
  }, []);

  useEffect(() => {
    if (!loading && initialBalanceForMonth === undefined && !showMonthPicker && page === 'dashboard') {
      setShowModal(true);
    } else {
      setShowModal(false);
    }
  }, [initialBalanceForMonth, showMonthPicker, page, loading]);

  const addTrade = async (tradeData) => {
    // We remove the temporary ID generated by form and let Firestore create one
    const { id: _, ...data } = tradeData;
    try {
        const docRef = await addDoc(tradesCollection, data);
        // Update local state with the real ID from Firestore
        setTrades(prev => [...prev, { ...data, id: docRef.id }]);
    } catch (e) {
        console.error("Error adding trade:", e);
        alert("Erro ao salvar operação.");
    }
  };
  
  const addDeposit = async (depositData) => {
      try {
          const docRef = await addDoc(depositsCollection, depositData);
          setDeposits(prev => [...prev, { ...depositData, id: docRef.id }]);
      } catch (e) {
          console.error("Error adding deposit:", e);
          alert("Erro ao adicionar aporte.");
      }
  };

  const deleteDeposit = async (id) => {
      try {
          await deleteDoc(doc(db, 'deposits', id));
          setDeposits(prev => prev.filter(d => d.id !== id));
      } catch (e) {
          console.error("Error deleting deposit:", e);
          alert("Erro ao remover aporte.");
      }
  };

  const importTrades = async (importedTrades) => {
      const batch = writeBatch(db);
      const newLocalTrades = [];

      importedTrades.forEach(trade => {
          const { id: _, ...data } = trade; // remove temp ID
          const docRef = doc(tradesCollection); // generate new ID ref
          batch.set(docRef, data);
          newLocalTrades.push({ ...data, id: docRef.id });
      });

      try {
          await batch.commit();
          setTrades(prev => [...prev, ...newLocalTrades]);
      } catch (e) {
          console.error("Error batch importing:", e);
          alert("Erro ao importar dados.");
      }
  }
  
  const handleDeleteRequest = (id) => {
      setTradeToDelete(id);
  };

  const confirmDelete = async () => {
      if (tradeToDelete) {
        try {
            await deleteDoc(doc(db, 'trades', tradeToDelete));
            setTrades(prev => prev.filter(trade => trade.id !== tradeToDelete));
            setTradeToDelete(null);
        } catch (e) {
            console.error("Error deleting trade:", e);
            alert("Erro ao apagar operação.");
        }
      }
  };

  const handleSaveInitialBalance = async (balance) => {
    try {
        // Use selectedMonth as document ID for balances collection
        await setDoc(doc(db, 'balances', selectedMonth), { value: balance });
        setBalances(prev => ({ ...prev, [selectedMonth]: balance }));
        setShowModal(false);
    } catch (e) {
        console.error("Error saving balance:", e);
        alert("Erro ao salvar banca inicial.");
    }
  };
  
  const handleMonthSelect = (newMonth) => {
      setSelectedMonth(newMonth);
      setShowMonthPicker(false);
  }

  const openBalanceModal = () => setShowModal(true);

  if (loading) {
      return <div className="loading">Carregando dados...</div>;
  }

  return (
    <>
      <Header page={page} setPage={setPage} />
      
      <main>
        {showModal && <InitialBalanceModal month={selectedMonth} onSave={handleSaveInitialBalance} initialValue={initialBalanceForMonth}/>}
        {showMonthPicker && <MonthYearPickerModal currentMonth={selectedMonth} onSelect={handleMonthSelect} onClose={() => setShowMonthPicker(false)} />}
        {tradeToDelete && <DeleteConfirmationModal onConfirm={confirmDelete} onCancel={() => setTradeToDelete(null)} />}
        
        {page === 'dashboard' && (
          <Dashboard 
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            trades={trades}
            balances={balances}
            deposits={deposits}
            initialBalance={initialBalanceForMonth ?? 0}
            onEditBalance={openBalanceModal}
            onOpenMonthPicker={() => setShowMonthPicker(true)}
            onAddDeposit={addDeposit}
            onDeleteDeposit={deleteDeposit}
          />
        )}

        {page === 'lancamentos' && (
          <>
              <TradeForm addTrade={addTrade} />
              <TradeList trades={trades} onDeleteRequest={handleDeleteRequest} selectedMonth={selectedMonth}/>
          </>
        )}

        {page === 'configuracoes' && (
            <Settings trades={trades} onImport={importTrades} />
        )}
      </main>

      {isMobile && <BottomNav page={page} setPage={setPage} />}
    </>
  );
};

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);