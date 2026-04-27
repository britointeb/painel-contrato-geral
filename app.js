const { useState, useEffect, useMemo, useRef } = React;

// =========================================================
// FUNÇÃO DESEMBARALHADORA (Imune a espaços invisíveis)
// =========================================================
const decodeBinary = (binStr) => {
    try {
        if (!binStr) return '';
        return binStr.trim().split(/\s+/).map(bin => {
            const parsed = parseInt(bin, 2);
            return isNaN(parsed) ? '' : String.fromCharCode(parsed);
        }).join('');
    } catch(e) {
        return '';
    }
};

// =========================================================
// CONFIGURAÇÕES DA API 
// =========================================================
const SPREADSHEET_ID = "1Fuhb3HMRzg2kEozkuREFNKYSXtqUCLhZWFFuWM-f3v4";
const LOCAL_STORAGE_KEYS = {
    auth: 'painel_contratos_auth_v1',
    dataCache: 'painel_contratos_data_cache_v1'
};

// Chave de API em binário
const BINARY_API_KEY = "01000001 01001001 01111010 01100001 01010011 01111001 01000011 01001011 01110010 01110110 01100001 01101011 01101011 01000010 01001000 00111001 01101100 00110100 01010111 01100010 01010001 01001011 01001110 01110111 01101010 01010000 00110010 01010011 01010000 01001101 01001001 01101110 01110011 01101110 01110100 01000001 01101010 01100011 01000001"; 
const API_KEY = decodeBinary(BINARY_API_KEY);

const RANGE = "CONTROLE_EXEC_CONTR!A1:BR2000"; 
const API_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}?key=${API_KEY}`;

// =========================================================
// FUNÇÕES DE LIMPEZA E FORMATAÇÃO GLOBAL
// =========================================================
const parseValue = (val) => {
    if (typeof val === 'number') return val;
    if (!val || val === "-" || val === "") return 0;
    let str = val.toString().trim().replace(/[R$\s]/g, '');
    if (str.includes('.') && str.includes(',')) {
        str = str.replace(/\./g, '').replace(',', '.');
    } else if (str.includes(',')) {
        str = str.replace(',', '.');
    }
    str = str.replace(/[^\d.-]/g, '');
    return parseFloat(str) || 0;
};

const parsePercentAsFloat = (val) => {
    if (typeof val === 'number') return val;
    if (!val || val === "-" || val === "") return 0;
    let str = val.toString().trim().replace(/[R$\s%]/g, '');
    if (str.includes('.') && str.includes(',')) str = str.replace(/\./g, '').replace(',', '.');
    else if (str.includes(',')) str = str.replace(',', '.');
    let num = parseFloat(str) || 0;
    if (num > 1 && num <= 100 && val.toString().includes('%')) num = num / 100;
    return num;
};

const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const formatPercentBR = (v) => new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const shortenNumber = (num) => {
    if (num >= 1e9) return (num / 1e9).toFixed(1).replace('.', ',') + ' Bi';
    if (num >= 1e6) return (num / 1e6).toFixed(1).replace('.', ',') + ' Mi';
    if (num >= 1e3) return (num / 1e3).toFixed(1).replace('.', ',') + ' Mil';
    return num;
};

const parseDateBR = (dStr) => {
    if (!dStr || dStr === "-") return null;
    if (dStr.includes('-')) return new Date(dStr + "T00:00:00");
    const parts = dStr.split('/');
    if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
    return new Date(dStr);
};

const formatLabelMultiLine = (text) => {
    if (!text) return [""];
    let cleanText = text.replace(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\s*-\s*/, '');
    if (cleanText.length <= 15) return [cleanText];
    
    const words = cleanText.split(' ');
    let lines = [];
    let currentLine = '';

    words.forEach(word => {
        if ((currentLine + word).length > 18) {
            if (currentLine) lines.push(currentLine.trim());
            currentLine = word + ' ';
        } else {
            currentLine += word + ' ';
        }
    });
    if (currentLine) lines.push(currentLine.trim());

    if (lines.length > 2) {
        return [lines[0], lines[1].substring(0, 15) + '...'];
    }
    return lines;
};

const getAdaptiveTickOptions = () => ({
    autoSkip: true,
    maxTicksLimit: 20,
    maxRotation: 65,
    minRotation: 0,
    font: { size: 9 },
    callback: function(value) {
        const label = this.getLabelForValue(value);
        return Array.isArray(label) ? label : formatLabelMultiLine(label);
    }
});

const safeLocalStorageGet = (key) => {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        return null;
    }
};

const safeLocalStorageSet = (key, value) => {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        // localStorage indisponível ou bloqueado.
    }
};

const safeLocalStorageRemove = (key) => {
    try {
        localStorage.removeItem(key);
    } catch (e) {
        // localStorage indisponível ou bloqueado.
    }
};

// =========================================================
// CONFIGURAÇÕES GLOBAIS DE GRÁFICOS
// =========================================================

// Tooltip Padrão para Gráficos
const tooltipCallback = {
    callbacks: {
        label: function(context) {
            let label = context.dataset.label || '';
            if (label) label += ': ';
            if (label.includes('Qtd') || label.includes('Quantidade')) {
                label += context.raw.toLocaleString('pt-BR');
            } else {
                label += formatBRL(context.raw);
            }
            return label;
        }
    }
};

// Tooltip Especial para Fornecedores
const getFullTooltipFornecedor = (dataArray) => ({
    callbacks: {
        title: function(tooltipItems) {
            const idx = tooltipItems[0].dataIndex;
            return dataArray[idx].label;
        },
        label: function(context) {
            let label = context.dataset.label || '';
            if (label) label += ': ';
            if (label.includes('Qtd') || label.includes('Quantidade')) {
                label += context.raw.toLocaleString('pt-BR');
            } else {
                label += formatBRL(context.raw);
            }
            return label;
        }
    }
});

// Tooltip Especial para Contratos
const getFullTooltipContrato = (dataArray) => ({
    callbacks: {
        title: function(tooltipItems) {
            const idx = tooltipItems[0].dataIndex;
            return dataArray[idx].contrato;
        },
        label: function(context) {
            let label = context.dataset.label || '';
            if (label) label += ': ';
            if (context.dataset.yAxisID === 'y_perc' || label.includes('%')) {
                label += formatPercentBR(context.raw);
                
                // Adiciona os dias que faltam se for a linha de % Tempo
                if (context.dataset.label === '% Tempo') {
                    const item = dataArray[context.dataIndex];
                    const dias = item.encerrando_dias !== null ? `${item.encerrando_dias} d` : '-';
                    label += ` (Faltam: ${dias})`;
                }
            } else {
                label += formatBRL(context.raw);
            }
            return label;
        }
    }
});

// Configuração das Pizzas (com Percentagens Exclusivas para elas)
const getPieOptions = () => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        tooltip: tooltipCallback,
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } },
        datalabels: {
            display: true, 
            color: '#fff',
            font: { weight: 'bold', size: 10 },
            formatter: (value, context) => {
                const dataArr = context.chart.data.datasets[0].data;
                const total = dataArr.reduce((a, b) => a + b, 0);
                if (!total) return '';
                const percentage = (value * 100 / total);
                return percentage > 4 ? percentage.toFixed(1).replace('.', ',') + '%' : '';
            }
        }
    }
});

// PLUGIN CUSTOMIZADO: Linha Vertical Tracejada
const customLinePlugin = {
    id: 'customLinePlugin',
    afterDatasetsDraw: (chart) => {
        const plugins = chart.config.options.plugins;
        const config = plugins && plugins.customLinePlugin;
        if (config && config.x !== undefined) {
            const ctx = chart.ctx;
            const scale = chart.scales[config.scaleID || 'x1'];
            const yAxis = chart.scales.y;
            if (!scale || !yAxis) return;
            
            const xPixel = scale.getPixelForValue(config.x);
            
            ctx.save();
            ctx.beginPath();
            ctx.setLineDash([5, 5]); // Define o tracejado
            ctx.moveTo(xPixel, yAxis.top);
            ctx.lineTo(xPixel, yAxis.bottom);
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)'; // Vermelho
            ctx.stroke();
            ctx.restore();
        }
    }
};

// =========================================================
// COMPONENTES DE UI AVANÇADOS
// =========================================================
const startResize = (e) => {
    const th = e.target.closest('th');
    const startX = e.pageX;
    const startWidth = th.getBoundingClientRect().width;
    
    const onMouseMove = (moveEvent) => {
        const newWidth = Math.max(40, startWidth + moveEvent.pageX - startX);
        th.style.width = `${newWidth}px`;
    };
    
    const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
};

function AutoFitText({ text, className }) {
    const containerRef = useRef(null);
    const textRef = useRef(null);

    useEffect(() => {
        const resize = () => {
            if (containerRef.current && textRef.current) {
                textRef.current.style.transform = 'none'; 
                const containerWidth = containerRef.current.clientWidth;
                const textWidth = textRef.current.scrollWidth;
                
                if (textWidth > containerWidth && containerWidth > 0) {
                    const scale = containerWidth / textWidth;
                    textRef.current.style.transform = `scale(${scale})`;
                }
            }
        };
        
        resize();
        setTimeout(resize, 50); 
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, [text]);

    return (
        <div ref={containerRef} className="w-full overflow-hidden flex items-center">
            <div ref={textRef} className={`${className} origin-left whitespace-nowrap inline-block`}>
                {text}
            </div>
        </div>
    );
}

const ChartComponent = ({ type, data, options, id }) => {
    const chartInstance = useRef(null);
    useEffect(() => {
        if (window.ChartDataLabels) {
            Chart.register(ChartDataLabels);
            Chart.defaults.set('plugins.datalabels', { display: false });
        }
        
        Chart.register(customLinePlugin);

        if (chartInstance.current) chartInstance.current.destroy();
        const ctx = document.getElementById(id).getContext('2d');
        chartInstance.current = new Chart(ctx, { type, data, options });
        return () => { if (chartInstance.current) chartInstance.current.destroy(); };
    }, [data, options]);
    return <canvas id={id}></canvas>;
};

function KPICard({ title, value, color, isCurrency }) {
    const colors = {
        slate: "border-slate-800 text-slate-800",
        blue: "border-blue-500 text-blue-700",
        amber: "border-amber-500 text-amber-600",
        emerald: "border-emerald-500 text-emerald-600"
    };
    const mainText = isCurrency ? formatBRL(value) : value.toLocaleString('pt-BR');

    return (
        <div className={`bg-white p-3 sm:p-6 rounded-2xl border-t-8 shadow-md flex flex-col justify-center overflow-hidden min-w-0 ${colors[color]}`}>
            <h3 className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-1 truncate" title={title}>{title}</h3>
            <div className="flex flex-col w-full min-w-0">
                <AutoFitText text={mainText} className="font-black text-3xl tracking-tight" />
            </div>
        </div>
    );
}

function TextHeader({ label, field, current, onSort, align="left", searchVal, onSearchChange, widthClass }) {
    const isSorted = current.key === field;
    return (
        <th className={`p-2 transition text-${align} bg-slate-50 relative group ${widthClass || 'w-auto'}`}>
            <div onMouseDown={startResize} className="absolute right-0 top-0 bottom-0 w-[4px] cursor-col-resize bg-transparent hover:bg-blue-400 z-20"></div>
            <div 
                className={`flex items-center gap-1 cursor-pointer hover:text-blue-500 justify-${align === 'right' ? 'end' : align === 'center' ? 'center' : 'start'}`}
                onClick={() => onSort(field)}
            >
                {label}
                <span className="text-[8px] text-slate-400">{isSorted ? (current.direction === 'asc' ? '▲' : '▼') : '↕'}</span>
            </div>
            {onSearchChange !== undefined && (
                <input 
                    type="text" 
                    placeholder="Buscar..." 
                    value={searchVal}
                    onChange={(e) => onSearchChange(e.target.value)}
                    onClick={(e) => e.stopPropagation()} 
                    className="mt-2 w-full px-1 py-1 text-slate-800 text-[9px] font-normal rounded border border-slate-300 outline-none focus:border-blue-500 shadow-inner"
                />
            )}
        </th>
    );
}

function NumericHeader({ label, field, current, onSort, numFilters, setNumFilters, align="left", widthClass }) {
    const isSorted = current.key === field;
    const filterMin = numFilters[field] ? numFilters[field].min : '';
    const filterMax = numFilters[field] ? numFilters[field].max : '';

    const handleMin = (e) => {
        const val = e.target.value;
        setNumFilters(p => {
            const newFilters = {...p};
            newFilters[field] = {...newFilters[field], min: val};
            return newFilters;
        });
    };
    
    const handleMax = (e) => {
        const val = e.target.value;
        setNumFilters(p => {
            const newFilters = {...p};
            newFilters[field] = {...newFilters[field], max: val};
            return newFilters;
        });
    };

    return (
        <th className={`p-2 transition text-${align} bg-slate-50 relative group ${widthClass || 'w-auto'}`}>
            <div onMouseDown={startResize} className="absolute right-0 top-0 bottom-0 w-[4px] cursor-col-resize bg-transparent hover:bg-blue-400 z-20"></div>
            <div 
                className={`flex items-center gap-1 cursor-pointer hover:text-blue-500 justify-${align === 'right' ? 'end' : align === 'center' ? 'center' : 'start'}`}
                onClick={() => onSort(field)}
            >
                {label}
                <span className="text-[8px] text-slate-400">{isSorted ? (current.direction === 'asc' ? '▲' : '▼') : '↕'}</span>
            </div>
            <div className="flex flex-col gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
                <input 
                    type="number" 
                    placeholder="< Max" 
                    value={filterMax}
                    onChange={handleMax}
                    className="w-full px-1 py-1 text-slate-800 text-[8px] font-normal rounded border border-slate-300 outline-none focus:border-blue-500 shadow-inner"
                />
                <input 
                    type="number" 
                    placeholder="> Min" 
                    value={filterMin}
                    onChange={handleMin}
                    className="w-full px-1 py-1 text-slate-800 text-[8px] font-normal rounded border border-slate-300 outline-none focus:border-blue-500 shadow-inner"
                />
            </div>
        </th>
    );
}

function MultiSelect({ label, options, selected, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef();

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const toggleOption = (opt) => {
        if (selected.includes(opt)) onChange(selected.filter(item => item !== opt));
        else onChange([...selected, opt]);
    };

    const filteredOptions = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

    const markAllVisible = () => {
        const newSelection = new Set([...selected, ...filteredOptions]);
        onChange(Array.from(newSelection));
    };

    return (
        <div className="relative" ref={ref}>
            <label className="text-[9px] font-black text-slate-400 block mb-1 uppercase tracking-widest">{label}</label>
            <div 
                className="w-full bg-slate-50 border border-slate-200 p-2 rounded-lg text-xs font-bold text-slate-700 cursor-pointer flex justify-between items-center shadow-sm"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className="truncate">{selected.length === 0 ? "TODOS OS REGISTROS" : `${selected.length} selecionado(s)`}</span>
                <span className="text-[10px]">▼</span>
            </div>
            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-2xl max-h-72 flex flex-col">
                    <div className="p-2 border-b bg-slate-50 flex flex-col gap-2">
                        <input 
                            type="text" 
                            placeholder="Pesquisar opções..." 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full border border-slate-300 rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
                        />
                        <div className="flex gap-2">
                            <button onClick={markAllVisible} className="text-[9px] font-bold bg-slate-200 text-slate-800 px-2 py-1 rounded w-full hover:bg-slate-300">Marcar Visíveis</button>
                            <button onClick={() => onChange([])} className="text-[9px] font-bold bg-red-100 text-red-700 px-2 py-1 rounded w-full hover:bg-red-200">Limpar</button>
                        </div>
                    </div>
                    <div className="overflow-y-auto p-1">
                        {filteredOptions.length === 0 && <p className="text-[10px] text-center text-slate-400 p-2">Nenhum resultado.</p>}
                        {filteredOptions.map((o, i) => (
                            <label key={i} className="flex items-center px-2 py-2 hover:bg-blue-50 cursor-pointer text-[10px] font-bold text-slate-700 border-b border-slate-100 last:border-0">
                                <input 
                                    type="checkbox" 
                                    checked={selected.includes(o)} 
                                    onChange={() => toggleOption(o)} 
                                    className="mr-2 cursor-pointer"
                                />
                                <span className="truncate leading-tight">{o}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function DateInput({ label, value, onChange }) {
    return (
        <div>
            <label className="text-[9px] font-black text-slate-400 block mb-1 uppercase tracking-widest">{label}</label>
            <input type="date" value={value} onChange={e => onChange(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-2 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition shadow-sm cursor-pointer" />
        </div>
    );
}

// =========================================================
// DASHBOARD MASTER
// =========================================================
function Dashboard({ onLogout }) {
    const [rawData, setRawData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState("A conectar à Google API v4...");
    
    const [sortConfig, setSortConfig] = useState({ key: 'v_empenhado', direction: 'desc' });
    
    // Estado dos seletores de ordenação nos gráficos
    const [fornecedorSort, setFornecedorSort] = useState('valor_desc');
    const [contratoSort, setContratoSort] = useState('valor_desc');
    
    const [fFiscal, setFFiscal] = useState([]);
    const [fGestor, setFGestor] = useState([]);
    const [fSecLog, setFSecLog] = useState([]);
    const [fContrato, setFContrato] = useState([]);
    const [fFornecedor, setFFornecedor] = useState([]);
    
    const [dInicDe, setDInicDe] = useState("");
    const [dInicAte, setDInicAte] = useState("");
    const [dFimDe, setDFimDe] = useState("");
    const [dFimAte, setDFimAte] = useState("");

    const [searchContrato, setSearchContrato] = useState("");
    const [searchFornecedor, setSearchFornecedor] = useState("");
    const [searchObjeto, setSearchObjeto] = useState("");
    const [searchGestorFiscal, setSearchGestorFiscal] = useState("");

    // Novos estados para os filtros de status especiais
    const [fInexecutados, setFInexecutados] = useState(false);
    const [fBloqueados, setFBloqueados] = useState(false);
    const [fCancelados, setFCancelados] = useState(false);

    const initialNumFilters = {
        perc_tempo: {min:'', max:''}, dias_passaram: {min:'', max:''},
        encerrando_dias: {min:'', max:''}, v_global: {min:'', max:''}, v_empenhado: {min:'', max:''},
        v_liquidado: {min:'', max:''}, p_liquidado: {min:'', max:''}, v_pago: {min:'', max:''},
        p_pago: {min:'', max:''}, v_bloqueado: {min:'', max:''}, p_bloqueado: {min:'', max:''},
        v_cancelado: {min:'', max:''}, p_cancelado: {min:'', max:''}, v_executado: {min:'', max:''}, p_executado: {min:'', max:''}
    };
    const [numFilters, setNumFilters] = useState(initialNumFilters);

    const saveRowsCache = (rows, source) => {
        safeLocalStorageSet(LOCAL_STORAGE_KEYS.dataCache, JSON.stringify({
            source,
            updatedAt: new Date().toISOString(),
            values: rows
        }));
    };

    const clearAllFilters = () => {
        setFFiscal([]); setFGestor([]); setFSecLog([]); setFContrato([]); setFFornecedor([]);
        setDInicDe(""); setDInicAte(""); setDFimDe(""); setDFimAte("");
        setSearchContrato(""); setSearchFornecedor(""); setSearchObjeto(""); setSearchGestorFiscal("");
        setFInexecutados(false); setFBloqueados(false); setFCancelados(false);
        setNumFilters(initialNumFilters);
    };

    const applyFilterAcessoHoje = () => {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        setDFimDe(`${yyyy}-${mm}-${dd}`);
        setDFimAte(""); 
    };

    const applyFilterCSup = () => {
        setFSecLog([
            "SGLS-CLASSE I", 
            "SGLFE-CLASSE II", 
            "SGLC-CLASSE III", 
            "SGLME-CLASSE V (MUN)"
        ]);
    };

    const processData = (rowsArray) => {
        if (!rowsArray || rowsArray.length < 2) {
            setStatus("Planilha vazia ou aba não encontrada.");
            setLoading(false);
            return;
        }

        const headers = rowsArray[0];
        const hoje = new Date();
        hoje.setHours(0,0,0,0);

        const mapped = rowsArray.slice(1).map(row => {
            const getVal = (name) => {
                const idx = headers.findIndex(h => h && h.toLowerCase().trim() === name.toLowerCase().trim());
                return (idx !== -1 && row[idx] !== undefined) ? row[idx] : "";
            };

            const dtInicRaw = getVal("Vig. Início");
            const dtFimRaw = getVal("Vig. Fim");
            const dtInicParsed = parseDateBR(dtInicRaw);
            const dtFimParsed = parseDateBR(dtFimRaw);

            let diasRestantes = null;
            let diasPassaram = null;
            let percTempo = null;

            if (dtFimParsed) {
                const diffTime = dtFimParsed - hoje;
                diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }
            if (dtInicParsed) {
                const diffPass = hoje - dtInicParsed;
                diasPassaram = Math.ceil(diffPass / (1000 * 60 * 60 * 24));
            }
            if (dtInicParsed && dtFimParsed) {
                const totalDias = Math.ceil((dtFimParsed - dtInicParsed) / (1000 * 60 * 60 * 24));
                if (totalDias > 0) {
                    percTempo = diasPassaram / totalDias;
                } else {
                    percTempo = 0;
                }
            }

            return {
                contrato: (getVal("Número Contrato") || getVal("numero_contrato") || "-").toString().toUpperCase(),
                fornecedor: (getVal("Fornecedor") || "-").toString().toUpperCase(),
                objeto: (getVal("Objeto") || "-").toString().toUpperCase(),
                fiscal: (getVal("FISCAL_TITULAR") || "N/I").toString().toUpperCase(),
                gestor: (getVal("GESTOR_TITULAR") || "N/I").toString().toUpperCase(),
                sec_log: (getVal("SEC_LOG") || "N/I").toString().toUpperCase(),
                modalidade: (getVal("Modalidade da Compra") || "N/I").toString().toUpperCase(),
                
                data_inic: dtInicRaw,
                data_fim: dtFimRaw,
                dtInicVal: dtInicParsed ? dtInicParsed.getTime() : 0,
                dtFimVal: dtFimParsed ? dtFimParsed.getTime() : 0,
                
                dias_passaram: diasPassaram,
                perc_tempo: percTempo,
                encerrando_dias: diasRestantes,
                
                v_global: parseValue(getVal("Valor Global")),
                v_empenhado: parseValue(getVal("TOTAL EMPENHADO")),
                v_liquidado: parseValue(getVal("TOTAL LIQUIDADO")),
                v_pago: parseValue(getVal("TOTAL PAGO")),
                v_bloqueado: parseValue(getVal("TOTAL BLOQUEADO")),
                v_cancelado: parseValue(getVal("TOTAL CANCELADO")),
                v_executado: parseValue(getVal("TOTAL EXECUTADO")),
                
                p_liquidado: parsePercentAsFloat(getVal("TOTAL LIQUIDADO %")),
                p_pago: parsePercentAsFloat(getVal("TOTAL PAGO %")),
                p_bloqueado: parsePercentAsFloat(getVal("TOTAL BLOQUEADO %")),
                p_cancelado: parsePercentAsFloat(getVal("TOTAL CANCELADO %")),
                p_executado: parsePercentAsFloat(getVal("TOTAL EXECUTADO %"))
            };
        }).filter(r => r.contrato !== "-" && r.fornecedor !== "-");
        
        setRawData(mapped);
        setLoading(false);
    };

    const loadData = async (manualFileContent = null) => {
        setLoading(true);
        
        if (manualFileContent) {
            setStatus("A processar CSV manual...");
            Papa.parse(manualFileContent, {
                header: false,
                skipEmptyLines: true,
                complete: (res) => {
                    processData(res.data);
                    saveRowsCache(res.data, 'manual_csv');
                    setStatus("Offline - Dados Carregados Manualmente via CSV");
                }
            });
            return;
        }

        try {
            const response = await fetch(API_URL);
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(`Erro API: ${errData.error.message}`);
            }
            const json = await response.json();
            if (!json.values) throw new Error("A aba retornou vazia ou o intervalo é inválido.");

            processData(json.values);
            saveRowsCache(json.values, 'google_api');
            setStatus("Online - Conectado via Google Sheets API v4");

        } catch (error) {
            console.error("Falha no acesso:", error.message);
            const cached = safeLocalStorageGet(LOCAL_STORAGE_KEYS.dataCache);
            if (cached) {
                try {
                    const parsedCache = JSON.parse(cached);
                    if (parsedCache && parsedCache.values && parsedCache.values.length) {
                        processData(parsedCache.values);
                        setStatus(`Offline - dados em cache (${parsedCache.source || 'origem desconhecida'}) de ${new Date(parsedCache.updatedAt).toLocaleString('pt-BR')}`);
                        return;
                    }
                } catch (e) {
                    // cache corrompido, segue fluxo de erro.
                }
            }
            setStatus(`Acesso à API falhou. Por favor, verifique a Chave/ID ou faça a Carga Manual.`);
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const filteredData = useMemo(() => {
        let filtered = rawData.filter(item => {
            const matchFisc = fFiscal.length === 0 || fFiscal.includes(item.fiscal);
            const matchGest = fGestor.length === 0 || fGestor.includes(item.gestor);
            const matchSec = fSecLog.length === 0 || fSecLog.includes(item.sec_log);
            const matchContratoFiltro = fContrato.length === 0 || fContrato.includes(item.contrato);
            const matchFornecedorFiltro = fFornecedor.length === 0 || fFornecedor.includes(item.fornecedor);
            
            const matchInicDe = !dInicDe || (item.dtInicVal && item.dtInicVal >= new Date(dInicDe+"T00:00:00").getTime());
            const matchInicAte = !dInicAte || (item.dtInicVal && item.dtInicVal <= new Date(dInicAte+"T23:59:59").getTime());
            const matchFimDe = !dFimDe || (item.dtFimVal && item.dtFimVal >= new Date(dFimDe+"T00:00:00").getTime());
            const matchFimAte = !dFimAte || (item.dtFimVal && item.dtFimVal <= new Date(dFimAte+"T23:59:59").getTime());

            const matchSearchContrato = !searchContrato || item.contrato.includes(searchContrato.toUpperCase());
            const matchSearchFornecedor = !searchFornecedor || item.fornecedor.includes(searchFornecedor.toUpperCase());
            const matchSearchObjeto = !searchObjeto || item.objeto.includes(searchObjeto.toUpperCase());
            const matchSearchGestorFiscal = !searchGestorFiscal || item.gestor.includes(searchGestorFiscal.toUpperCase()) || item.fiscal.includes(searchGestorFiscal.toUpperCase());

            // Filtros de Status Especiais
            if (fInexecutados && item.p_executado >= 0.9999) return false;
            if (fBloqueados && item.v_bloqueado <= 0) return false;
            if (fCancelados && item.v_cancelado <= 0) return false;

            let matchNum = true;
            for (const key in numFilters) {
                const filterMin = numFilters[key].min;
                const filterMax = numFilters[key].max;
                
                if (filterMin !== '') {
                    const minVal = parseFloat(filterMin);
                    const itemVal = key.startsWith('p_') ? item[key] * 100 : item[key];
                    if (itemVal === null || itemVal < minVal) { matchNum = false; break; }
                }
                if (filterMax !== '') {
                    const maxVal = parseFloat(filterMax);
                    const itemVal = key.startsWith('p_') ? item[key] * 100 : item[key];
                    if (itemVal === null || itemVal > maxVal) { matchNum = false; break; }
                }
            }

            return matchFisc && matchGest && matchSec && matchContratoFiltro && matchFornecedorFiltro && matchInicDe && matchInicAte && matchFimDe && matchFimAte &&
                   matchSearchContrato && matchSearchFornecedor && matchSearchObjeto && matchSearchGestorFiscal && matchNum;
        });

        if (sortConfig.key) {
            filtered.sort((a, b) => {
                let valA = a[sortConfig.key];
                let valB = b[sortConfig.key];
                
                if (sortConfig.key === 'data_inic') { valA = a.dtInicVal; valB = b.dtInicVal; }
                else if (sortConfig.key === 'data_fim') { valA = a.dtFimVal; valB = b.dtFimVal; }
                else if (sortConfig.key === 'encerrando_dias') {
                    valA = valA !== null ? valA : -999999;
                    valB = valB !== null ? valB : -999999;
                }
                else if (sortConfig.key === 'dias_passaram') {
                    valA = valA !== null ? valA : -999999;
                    valB = valB !== null ? valB : -999999;
                }
                else if (sortConfig.key === 'perc_tempo') {
                    valA = valA !== null ? valA : -999999;
                    valB = valB !== null ? valB : -999999;
                }

                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return filtered;
    }, [rawData, fFiscal, fGestor, fSecLog, fContrato, fFornecedor, dInicDe, dInicAte, dFimDe, dFimAte, searchContrato, searchFornecedor, searchObjeto, searchGestorFiscal, numFilters, sortConfig, fInexecutados, fBloqueados, fCancelados]);

    const kpis = useMemo(() => ({
        qtdContratos: filteredData.length,
        totalEmpenhado: filteredData.reduce((acc, curr) => acc + curr.v_empenhado, 0),
        qtdGestores: new Set(filteredData.map(d => d.gestor)).size,
        qtdFiscais: new Set(filteredData.map(d => d.fiscal)).size
    }), [filteredData]);

    const tableTotals = useMemo(() => ({
        qtdContratos: filteredData.length,
        empenhado: filteredData.reduce((acc, curr) => acc + curr.v_empenhado, 0),
        liquidado: filteredData.reduce((acc, curr) => acc + curr.v_liquidado, 0),
        pago: filteredData.reduce((acc, curr) => acc + curr.v_pago, 0),
        bloqueado: filteredData.reduce((acc, curr) => acc + curr.v_bloqueado, 0),
        cancelado: filteredData.reduce((acc, curr) => acc + curr.v_cancelado, 0)
    }), [filteredData]);

    const getChartData = (keyName) => {
        const map = {};
        filteredData.forEach(item => {
            const k = item[keyName];
            if (!map[k]) map[k] = { label: k, count: 0, total: 0 };
            map[k].count += 1;
            map[k].total += item.v_empenhado;
        });
        return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10);
    };

    const gestorData = getChartData('gestor');
    const fiscalData = getChartData('fiscal');
    const modData = getChartData('modalidade');
    const secData = getChartData('sec_log');

    const fornecedorChartData = useMemo(() => {
        const map = {};
        filteredData.forEach(item => {
            const k = item.fornecedor;
            if (!map[k]) map[k] = { label: k, count: 0, total: 0 };
            map[k].count += 1;
            map[k].total += item.v_empenhado;
        });
        let arr = Object.values(map);

        if (fornecedorSort === 'valor_desc') arr.sort((a, b) => b.total - a.total);
        else if (fornecedorSort === 'qtd_desc') arr.sort((a, b) => b.count - a.count);
        else if (fornecedorSort === 'nome_asc') arr.sort((a, b) => a.label.localeCompare(b.label));
        else if (fornecedorSort === 'nome_desc') arr.sort((a, b) => b.label.localeCompare(a.label));

        return arr.slice(0, 20); 
    }, [filteredData, fornecedorSort]);

    const contratoChartData = useMemo(() => {
        let arr = [...filteredData];
        if (contratoSort === 'valor_desc') arr.sort((a, b) => b.v_empenhado - a.v_empenhado);
        else if (contratoSort === 'exec_desc') arr.sort((a, b) => b.p_executado - a.p_executado);
        else if (contratoSort === 'tempo_desc') arr.sort((a, b) => b.perc_tempo - a.perc_tempo);
        else if (contratoSort === 'nome_asc') arr.sort((a, b) => a.contrato.localeCompare(b.contrato));
        
        return arr.slice(0, 20); 
    }, [filteredData, contratoSort]);

    const contratosPorAnoData = useMemo(() => {
        const mapByYear = {};
        filteredData.forEach(item => {
            const anoInicio = item.dtInicVal ? new Date(item.dtInicVal).getFullYear() : null;
            const anoFim = item.dtFimVal ? new Date(item.dtFimVal).getFullYear() : null;

            if (anoInicio) {
                if (!mapByYear[anoInicio]) {
                    mapByYear[anoInicio] = { iniciados: new Set(), encerrados: new Set(), empenhadoInicio: 0 };
                }
                if (!mapByYear[anoInicio].iniciados.has(item.contrato)) {
                    mapByYear[anoInicio].iniciados.add(item.contrato);
                    mapByYear[anoInicio].empenhadoInicio += item.v_empenhado || 0;
                }
            }
            if (anoFim) {
                if (!mapByYear[anoFim]) {
                    mapByYear[anoFim] = { iniciados: new Set(), encerrados: new Set(), empenhadoInicio: 0 };
                }
                mapByYear[anoFim].encerrados.add(item.contrato);
            }
        });

        return Object.keys(mapByYear)
            .map(Number)
            .sort((a, b) => a - b)
            .map((year) => ({
                year,
                qtdIniciados: mapByYear[year].iniciados.size,
                qtdEncerrados: mapByYear[year].encerrados.size,
                valorEmpenhado: mapByYear[year].empenhadoInicio
            }));
    }, [filteredData]);

    const handleSort = (key) => setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));

    // =========================================================
    // FUNÇÕES DE EXPORTAÇÃO
    // =========================================================

    const prepareTableData = () => {
        return filteredData.map(item => ({
            'Contrato': item.contrato,
            'Fornecedor': item.fornecedor,
            'Objeto': item.objeto,
            'Gestor': item.gestor,
            'Fiscal': item.fiscal,
            'Vig. Início': item.data_inic || "-",
            'Vig. Fim': item.data_fim || "-",
            'Perc. Tempo': item.perc_tempo,
            'Passaram (Dias)': item.dias_passaram !== null ? item.dias_passaram : "-",
            'Faltam (Dias)': item.encerrando_dias !== null ? item.encerrando_dias : "-",
            'Vlr. Global': item.v_global,
            'Empenhado': item.v_empenhado,
            'Liquidado': item.v_liquidado,
            'Pago': item.v_pago,
            'Bloqueado': item.v_bloqueado,
            'Cancelado': item.v_cancelado,
            'Executado': item.v_executado,
            'Liq %': item.p_liquidado,
            'Pago %': item.p_pago,
            'Bloq %': item.p_bloqueado,
            'Canc %': item.p_cancelado,
            'Exec %': item.p_executado,
        }));
    };

    const exportToCSV = () => {
        const data = prepareTableData();
        const csv = Papa.unparse(data);
        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'Relatorio-Contratos.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportToExcel = () => {
        if (!window.XLSX) { alert("Biblioteca Excel ainda não carregada."); return; }
        const data = prepareTableData();
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Contratos");
        XLSX.writeFile(workbook, "Relatorio-Contratos.xlsx");
    };

    const exportTableToPDF = () => {
        if (!window.jspdf || !window.jspdf.jsPDF) { alert("Biblioteca PDF não carregada."); return; }
        const doc = new window.jspdf.jsPDF('l', 'pt', 'a4'); // Orientação paisagem para tabelas largas
        const data = prepareTableData();
        
        const formattedBody = data.map(item => [
            item['Contrato'], 
            item['Fornecedor'].substring(0,25), 
            item['Objeto'].substring(0,25),
            item['Gestor'], 
            item['Fiscal'], 
            item['Vig. Início'], 
            item['Vig. Fim'], 
            item['Perc. Tempo'] !== null ? formatPercentBR(item['Perc. Tempo']) : "-",
            item['Passaram (Dias)'],
            item['Faltam (Dias)'],
            formatBRL(item['Vlr. Global']), 
            formatBRL(item['Empenhado']), 
            formatBRL(item['Liquidado']), 
            formatBRL(item['Pago']), 
            formatBRL(item['Bloqueado']), 
            formatBRL(item['Cancelado']),
            formatBRL(item['Executado'])
        ]);
        
        const formattedHead = [['Contrato', 'Fornecedor', 'Objeto', 'Gestor', 'Fiscal', 'Início', 'Fim', '% Tempo', 'Passaram', 'Faltam', 'Global', 'Empenhado', 'Liquid.', 'Pago', 'Bloq.', 'Canc.', 'Exec.']];

        doc.autoTable({
            head: formattedHead,
            body: formattedBody,
            styles: { fontSize: 5, cellPadding: 2, overflow: 'linebreak' },
            headStyles: { fillColor: [30, 41, 59], textColor: 255 }, // slate-800
            margin: { top: 20, left: 10, right: 10 },
        });
        doc.save('Tabela-Contratos.pdf');
    };

    if (loading) return (
        <div className="h-screen flex flex-col items-center justify-center font-black text-slate-400 gap-4">
            <div className="w-12 h-12 border-4 border-slate-300 border-t-slate-800 rounded-full animate-spin"></div>
            <p>A PROCESSAR LIGAÇÃO...</p>
        </div>
    );

    return (
        <div className="p-4 md:p-8 relative">

            {/* CABEÇALHO */}
            <header className="max-w-[1600px] mx-auto mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter text-slate-800">PAINEL GERAL DE CONTRATOS</h1>
                    <p className={`text-[11px] font-bold mt-1 ${status.includes("Erro") || status.includes("falhou") ? "text-red-600" : "text-emerald-600"}`}>
                        ● {status}
                    </p>
                </div>
                <div className="flex gap-2 items-center bg-white px-4 py-2 rounded-lg border shadow-sm flex-wrap justify-end">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Carga Manual (CSV):</span>
                    <input type="file" accept=".csv" onChange={(e) => {
                        const r = new FileReader();
                        r.onload = (ev) => loadData(ev.target.result);
                        r.readAsText(e.target.files[0]);
                    }} className="text-xs cursor-pointer text-blue-600 font-bold w-[200px]" />
                    <button
                        onClick={onLogout}
                        className="text-[10px] font-black uppercase bg-red-600 text-white px-3 py-2 rounded hover:bg-red-700 transition shadow-sm"
                    >
                        Sair
                    </button>
                </div>
            </header>

            <div className="max-w-[1600px] mx-auto mb-6 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <h2 className="text-xs font-black uppercase tracking-widest text-[#99bbd4] mb-4">Filtros Dinâmicos</h2>
                
                <div className="mb-4 pb-4 border-b border-slate-100 flex flex-col gap-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status Especiais e Ações Rápidas:</span>
                    <div className="flex flex-wrap gap-2 items-center">
                        <button 
                            onClick={() => setFInexecutados(!fInexecutados)} 
                            className={`text-[10px] font-bold uppercase px-4 py-2 rounded transition shadow-sm ${fInexecutados ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                            Inexecutados (&lt; 100%)
                        </button>
                        <button 
                            onClick={() => setFBloqueados(!fBloqueados)} 
                            className={`text-[10px] font-bold uppercase px-4 py-2 rounded transition shadow-sm ${fBloqueados ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                            Bloqueados (&gt; 0)
                        </button>
                        <button 
                            onClick={() => setFCancelados(!fCancelados)} 
                            className={`text-[10px] font-bold uppercase px-4 py-2 rounded transition shadow-sm ${fCancelados ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                            Cancelados (&gt; 0)
                        </button>
                        
                        <div className="w-px h-6 bg-slate-200 mx-2 hidden sm:block"></div>
                        
                        <button onClick={applyFilterCSup} className="text-[10px] font-bold uppercase bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition shadow-md">
                            C SUP
                        </button>
                        <button onClick={applyFilterAcessoHoje} className="text-[10px] font-bold uppercase bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700 transition shadow-md">
                            A Partir de Hoje
                        </button>
                        <button onClick={clearAllFilters} className="text-[10px] font-bold uppercase bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700 transition shadow-md">
                            Limpar Todos os Filtros
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
                    <MultiSelect label="FISCAL TITULAR" options={[...new Set(rawData.map(r => r.fiscal))].sort()} selected={fFiscal} onChange={setFFiscal} />
                    <MultiSelect label="GESTOR TITULAR" options={[...new Set(rawData.map(r => r.gestor))].sort()} selected={fGestor} onChange={setFGestor} />
                    <MultiSelect label="SEC LOG" options={[...new Set(rawData.map(r => r.sec_log))].sort()} selected={fSecLog} onChange={setFSecLog} />
                    <MultiSelect label="CONTRATO" options={[...new Set(rawData.map(r => r.contrato))].sort()} selected={fContrato} onChange={setFContrato} />
                    <MultiSelect label="FORNECEDOR" options={[...new Set(rawData.map(r => r.fornecedor))].sort()} selected={fFornecedor} onChange={setFFornecedor} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <DateInput label="VIG. INÍCIO (DE)" value={dInicDe} onChange={setDInicDe} />
                    <DateInput label="VIG. INÍCIO (ATÉ)" value={dInicAte} onChange={setDInicAte} />
                    <DateInput label="VIG. FIM (DE)" value={dFimDe} onChange={setDFimDe} />
                    <DateInput label="VIG. FIM (ATÉ)" value={dFimAte} onChange={setDFimAte} />
                </div>
            </div>

            <div className="max-w-[1600px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <KPICard title="Quantidade de Contratos" value={kpis.qtdContratos} color="slate" isCurrency={false} />
                <KPICard title="Valor Total Empenhado" value={kpis.totalEmpenhado} color="blue" isCurrency={true} />
                <KPICard title="Gestores Envolvidos" value={kpis.qtdGestores} color="amber" isCurrency={false} />
                <KPICard title="Fiscais Envolvidos" value={kpis.qtdFiscais} color="emerald" isCurrency={false} />
            </div>

            <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="text-xs font-black text-slate-800 mb-4 uppercase">Valor Empenhado e Qtd. por Gestor</h3>
                    <ChartComponent id="gestorChart" type="bar" data={{
                        labels: gestorData.map(d => d.label.substring(0,25)),
                        datasets: [
                            { 
                                label: 'Qtd. Contratos', 
                                data: gestorData.map(d => d.count), 
                                backgroundColor: '#eab308', 
                                xAxisID: 'x1', 
                                borderRadius: 4,
                                datalabels: {
                                    display: function(context) { return context.dataset.data[context.dataIndex] > 0; },
                                    color: '#1e293b',
                                    anchor: 'end', align: 'start', offset: 4, clip: true,
                                    font: { size: 9, weight: 'bold' },
                                    formatter: v => v
                                }
                            },
                            { 
                                label: 'Valor Empenhado', 
                                data: gestorData.map(d => d.total), 
                                backgroundColor: '#3b82f6', 
                                xAxisID: 'x', 
                                borderRadius: 4,
                                datalabels: {
                                    display: function(context) { return context.dataset.data[context.dataIndex] > 0; },
                                    color: '#fff',
                                    anchor: 'end', align: 'start', offset: 4, clip: true,
                                    font: { size: 9, weight: 'bold' },
                                    formatter: v => shortenNumber(v)
                                }
                            }
                        ]
                    }} options={{ 
                        indexAxis: 'y', responsive: true, 
                        plugins: { tooltip: tooltipCallback, customLinePlugin: { x: 20, scaleID: 'x1' }, datalabels: { display: false } },
                        scales: { x: { ticks: { callback: v => shortenNumber(v) } }, x1: { position: 'top', grid: { display: false } } }
                    }} />
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="text-xs font-black text-slate-800 mb-4 uppercase">Valor Empenhado e Qtd. por Fiscal</h3>
                    <ChartComponent id="fiscalChart" type="bar" data={{
                        labels: fiscalData.map(d => d.label.substring(0,25)),
                        datasets: [
                            { 
                                label: 'Qtd. Contratos', 
                                data: fiscalData.map(d => d.count), 
                                backgroundColor: '#f97316', 
                                xAxisID: 'x1', 
                                borderRadius: 4,
                                datalabels: {
                                    display: function(context) { return context.dataset.data[context.dataIndex] > 0; },
                                    color: '#1e293b',
                                    anchor: 'end', align: 'start', offset: 4, clip: true,
                                    font: { size: 9, weight: 'bold' },
                                    formatter: v => v
                                }
                            },
                            { 
                                label: 'Valor Empenhado', 
                                data: fiscalData.map(d => d.total), 
                                backgroundColor: '#22c55e', 
                                xAxisID: 'x', 
                                borderRadius: 4,
                                datalabels: {
                                    display: function(context) { return context.dataset.data[context.dataIndex] > 0; },
                                    color: '#fff',
                                    anchor: 'end', align: 'start', offset: 4, clip: true,
                                    font: { size: 9, weight: 'bold' },
                                    formatter: v => shortenNumber(v)
                                }
                            }
                        ]
                    }} options={{ 
                        indexAxis: 'y', responsive: true, 
                        plugins: { tooltip: tooltipCallback, customLinePlugin: { x: 10, scaleID: 'x1' }, datalabels: { display: false } },
                        scales: { x: { ticks: { callback: v => shortenNumber(v) } }, x1: { position: 'top', grid: { display: false } } }
                    }} />
                </div>
            </div>

            {/* 4 GRÁFICOS DE PIZZA */}
            <div className="max-w-[1600px] mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center">
                    <h3 className="text-[10px] font-black text-slate-800 mb-4 uppercase w-full text-center">Empenhado por Modalidade</h3>
                    <div className="w-full h-56"><ChartComponent id="modChartVal" type="pie" data={{
                        labels: modData.map(d => d.label),
                        datasets: [{ label: 'Valor Empenhado', data: modData.map(d => d.total), backgroundColor: ['#3b82f6', '#eab308', '#22c55e', '#f97316', '#ef4444', '#8b5cf6', '#ec4899'] }]
                    }} options={getPieOptions()} /></div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center">
                    <h3 className="text-[10px] font-black text-slate-800 mb-4 uppercase w-full text-center">Qtd. Contratos por Modalidade</h3>
                    <div className="w-full h-56"><ChartComponent id="modChartQtd" type="pie" data={{
                        labels: modData.map(d => d.label),
                        datasets: [{ label: 'Qtd. Contratos', data: modData.map(d => d.count), backgroundColor: ['#3b82f6', '#eab308', '#22c55e', '#f97316', '#ef4444', '#8b5cf6', '#ec4899'] }]
                    }} options={getPieOptions()} /></div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center">
                    <h3 className="text-[10px] font-black text-slate-800 mb-4 uppercase w-full text-center">Empenhado por SEC LOG</h3>
                    <div className="w-full h-56"><ChartComponent id="secChartVal" type="pie" data={{
                        labels: secData.map(d => d.label),
                        datasets: [{ label: 'Valor Empenhado', data: secData.map(d => d.total), backgroundColor: ['#3b82f6', '#eab308', '#22c55e', '#f97316', '#ef4444', '#8b5cf6', '#ec4899'] }]
                    }} options={getPieOptions()} /></div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center">
                    <h3 className="text-[10px] font-black text-slate-800 mb-4 uppercase w-full text-center">Qtd. Contratos por SEC LOG</h3>
                    <div className="w-full h-56"><ChartComponent id="secChartQtd" type="pie" data={{
                        labels: secData.map(d => d.label),
                        datasets: [{ label: 'Qtd. Contratos', data: secData.map(d => d.count), backgroundColor: ['#3b82f6', '#eab308', '#22c55e', '#f97316', '#ef4444', '#8b5cf6', '#ec4899'] }]
                    }} options={getPieOptions()} /></div>
                </div>
            </div>

            <div className="max-w-[1600px] mx-auto mb-10">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                        <h3 className="text-xs font-black text-slate-800 uppercase mb-2 sm:mb-0">Valor Empenhado e Qtd. por Fornecedor (Top 20)</h3>
                        <select 
                            value={fornecedorSort} 
                            onChange={(e) => setFornecedorSort(e.target.value)}
                            className="text-[10px] font-bold uppercase border border-slate-300 text-slate-700 bg-slate-50 rounded-lg px-3 py-2 outline-none focus:border-blue-50 shadow-sm cursor-pointer"
                        >
                            <option value="valor_desc">Maior Valor Empenhado</option>
                            <option value="qtd_desc">Maior Quantidade (Qtd)</option>
                            <option value="nome_asc">Ordem Alfabética (A-Z)</option>
                            <option value="nome_desc">Ordem Alfabética (Z-A)</option>
                        </select>
                    </div>
                    <div className="h-[400px]">
                        <ChartComponent id="fornecChart" type="bar" data={{
                            labels: fornecedorChartData.map(d => formatLabelMultiLine(d.label)),
                            datasets: [
                                { 
                                    label: 'Qtd. Contratos', 
                                    data: fornecedorChartData.map(d => d.count), 
                                    backgroundColor: '#f97316', 
                                    yAxisID: 'y1', 
                                    borderRadius: 4, 
                                    type: 'bar',
                                    datalabels: {
                                        display: function(context) { return context.dataset.data[context.dataIndex] > 0; },
                                        color: '#1e293b',
                                        anchor: 'end', align: 'start', offset: 4, clip: true,
                                        rotation: 90,
                                        font: { size: 9, weight: 'bold' },
                                        formatter: v => v
                                    }
                                },
                                { 
                                    label: 'Valor Empenhado', 
                                    data: fornecedorChartData.map(d => d.total), 
                                    backgroundColor: '#3b82f6', 
                                    yAxisID: 'y', 
                                    borderRadius: 4,
                                    datalabels: {
                                        display: function(context) { return context.dataset.data[context.dataIndex] > 0; },
                                        color: '#fff',
                                        anchor: 'end', align: 'start', offset: 4, clip: true,
                                        rotation: 90,
                                        font: { size: 9, weight: 'bold' },
                                        formatter: v => shortenNumber(v)
                                    }
                                }
                            ]
                        }} options={{
                            indexAxis: 'x',
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { tooltip: getFullTooltipFornecedor(fornecedorChartData), datalabels: { display: false } },
                            scales: {
                                x: { ticks: getAdaptiveTickOptions() },
                                y: { type: 'linear', position: 'left', ticks: { callback: v => shortenNumber(v) } },
                                y1: { type: 'linear', position: 'right', grid: { display: false } }
                            }
                        }} />
                    </div>
                </div>
            </div>

            <div className="max-w-[1600px] mx-auto mb-10">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="text-xs font-black text-slate-800 uppercase mb-4">
                        Contratos Iniciados/Encerrados por Ano e Valor Empenhado
                    </h3>
                    <div className="h-[360px]">
                        <ChartComponent id="contratosAnoChart" type="bar" data={{
                            labels: contratosPorAnoData.map(d => d.year.toString()),
                            datasets: [
                                {
                                    label: 'Qtd. Iniciados',
                                    data: contratosPorAnoData.map(d => d.qtdIniciados),
                                    backgroundColor: '#22c55e',
                                    yAxisID: 'y',
                                    borderRadius: 4,
                                    datalabels: {
                                        display: function(context) { return context.dataset.data[context.dataIndex] > 0; },
                                        color: '#14532d',
                                        rotation: 270,
                                        anchor: 'end',
                                        align: 'start',
                                        offset: 2,
                                        font: { family: 'Outfit', size: 10, weight: '700' },
                                        formatter: (v) => v.toLocaleString('pt-BR')
                                    }
                                },
                                {
                                    label: 'Qtd. Encerrados',
                                    data: contratosPorAnoData.map(d => d.qtdEncerrados),
                                    backgroundColor: '#f97316',
                                    yAxisID: 'y',
                                    borderRadius: 4,
                                    datalabels: {
                                        display: function(context) { return context.dataset.data[context.dataIndex] > 0; },
                                        color: '#9a3412',
                                        rotation: 270,
                                        anchor: 'end',
                                        align: 'start',
                                        offset: 2,
                                        font: { family: 'Outfit', size: 10, weight: '700' },
                                        formatter: (v) => v.toLocaleString('pt-BR')
                                    }
                                },
                                {
                                    label: 'Valor Empenhado (Início Vigência)',
                                    data: contratosPorAnoData.map(d => d.valorEmpenhado),
                                    backgroundColor: '#3b82f6',
                                    yAxisID: 'y2',
                                    borderRadius: 4,
                                    datalabels: {
                                        display: function(context) { return context.dataset.data[context.dataIndex] > 0; },
                                        color: '#1e3a8a',
                                        rotation: 270,
                                        anchor: 'end',
                                        align: 'start',
                                        offset: 2,
                                        font: { family: 'Outfit', size: 10, weight: '700' },
                                        formatter: (v) => shortenNumber(v)
                                    }
                                }
                            ]
                        }} options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                tooltip: {
                                    callbacks: {
                                        title: (items) => `Ano: ${items[0].label}`,
                                        label: (context) => {
                                            const base = `${context.dataset.label}: `;
                                            if (context.dataset.label.includes('Qtd.')) return base + context.raw.toLocaleString('pt-BR');
                                            return base + formatBRL(context.raw);
                                        }
                                    },
                                    bodyFont: { family: 'Outfit' },
                                    titleFont: { family: 'Outfit' }
                                },
                                datalabels: { display: false }
                            },
                            scales: {
                                x: { title: { display: true, text: 'Ano' } },
                                y: { title: { display: true, text: 'Quantidade de Contratos' }, beginAtZero: true },
                                y2: {
                                    title: { display: true, text: 'Valor Empenhado' },
                                    position: 'right',
                                    grid: { display: false },
                                    ticks: { callback: v => shortenNumber(v) }
                                }
                            }
                        }} />
                    </div>
                </div>
            </div>

            {/* NOVO GRÁFICO: DESEMPENHO POR CONTRATO */}
            <div className="max-w-[1600px] mx-auto mb-10">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                        <h3 className="text-xs font-black text-slate-800 uppercase mb-2 sm:mb-0">Desempenho e Empenho por Contrato (Top 20)</h3>
                        <select 
                            value={contratoSort} 
                            onChange={(e) => setContratoSort(e.target.value)}
                            className="text-[10px] font-bold uppercase border border-slate-300 text-slate-700 bg-slate-50 rounded-lg px-3 py-2 outline-none focus:border-blue-500 shadow-sm cursor-pointer"
                        >
                            <option value="valor_desc">Maior Valor Empenhado</option>
                            <option value="exec_desc">Maior % Execução</option>
                            <option value="tempo_desc">Maior % Tempo Decorrido</option>
                            <option value="nome_asc">Ordem Alfabética</option>
                        </select>
                    </div>
                    <div className="h-[400px]">
                        <ChartComponent id="contratoChart" type="bar" data={{
                            labels: contratoChartData.map(d => d.contrato),
                            datasets: [
                                {
                                    label: '% Tempo',
                                    data: contratoChartData.map(d => d.perc_tempo),
                                    borderColor: '#eab308', // Alterado para Amarelo/Âmbar
                                    backgroundColor: '#eab308',
                                    yAxisID: 'y_perc',
                                    type: 'line',
                                    borderWidth: 2,
                                    tension: 0.3,
                                    pointRadius: 4,
                                    datalabels: {
                                        display: true,
                                        color: '#ca8a04',
                                        anchor: 'end', align: 'top', offset: 4,
                                        rotation: 0,
                                        font: { size: 9, weight: 'bold' },
                                        formatter: v => formatPercentBR(v)
                                    }
                                },
                                { 
                                    label: '% Execução', 
                                    data: contratoChartData.map(d => d.p_executado), 
                                    backgroundColor: '#22c55e', 
                                    yAxisID: 'y_perc', 
                                    borderRadius: 4, 
                                    type: 'bar',
                                    datalabels: {
                                        display: function(context) { return context.dataset.data[context.dataIndex] > 0; },
                                        color: '#fff',
                                        anchor: 'end', align: 'start', offset: 4, clip: true,
                                        rotation: 90,
                                        font: { size: 9, weight: 'bold' },
                                        formatter: v => formatPercentBR(v)
                                    }
                                },
                                { 
                                    label: 'Valor Empenhado', 
                                    data: contratoChartData.map(d => d.v_empenhado), 
                                    backgroundColor: '#3b82f6', 
                                    yAxisID: 'y_val', 
                                    borderRadius: 4, 
                                    type: 'bar',
                                    datalabels: {
                                        display: function(context) { return context.dataset.data[context.dataIndex] > 0; },
                                        color: '#fff',
                                        anchor: 'end', align: 'start', offset: 4, clip: true,
                                        rotation: 90,
                                        font: { size: 9, weight: 'bold' },
                                        formatter: v => shortenNumber(v)
                                    }
                                }
                            ]
                        }} options={{
                            indexAxis: 'x',
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { tooltip: getFullTooltipContrato(contratoChartData), datalabels: { display: false } },
                            scales: {
                                x: { ticks: getAdaptiveTickOptions() },
                                y_perc: {
                                    type: 'linear',
                                    position: 'left',
                                    ticks: { callback: v => (v * 100).toFixed(0) + '%' }
                                }, 
                                y_val: { 
                                    type: 'linear', 
                                    position: 'right', 
                                    grid: { display: false },
                                    ticks: { callback: v => shortenNumber(v) }
                                } 
                            }
                        }} />
                    </div>
                </div>
            </div>

            {/* TABELA DE DADOS MASTER */}
            <div className="max-w-[1600px] mx-auto bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-800 px-4 py-3 flex justify-between items-center flex-wrap gap-2">
                    <h3 className="text-white text-xs font-black tracking-widest uppercase">
                        Detalhamento Financeiro dos Contratos ({tableTotals.qtdContratos.toLocaleString('pt-BR')})
                    </h3>

                    <div className="flex gap-2">
                        <button onClick={exportToExcel} className="text-[10px] font-bold bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded shadow-sm transition">
                            EXCEL
                        </button>
                        <button onClick={exportToCSV} className="text-[10px] font-bold bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded shadow-sm transition">
                            CSV
                        </button>
                        <button onClick={exportTableToPDF} className="text-[10px] font-bold bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded shadow-sm transition">
                            PDF
                        </button>
                    </div>
                </div>
                <div className="overflow-x-auto h-[600px]">
                    <table className="w-full text-left text-[10px] border-collapse relative" style={{ tableLayout: 'fixed', minWidth: '1900px' }}>
                        <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 shadow-sm z-10">
                            <tr className="text-slate-600 uppercase font-black tracking-tighter align-top">
                                <TextHeader widthClass="w-[7%]" label="Contrato" field="contrato" current={sortConfig} onSort={handleSort} searchVal={searchContrato} onSearchChange={setSearchContrato} />
                                <TextHeader widthClass="w-[12%]" label="Fornecedor" field="fornecedor" current={sortConfig} onSort={handleSort} searchVal={searchFornecedor} onSearchChange={setSearchFornecedor} />
                                <TextHeader widthClass="w-[12%]" label="Objeto" field="objeto" current={sortConfig} onSort={handleSort} searchVal={searchObjeto} onSearchChange={setSearchObjeto} />
                                <TextHeader widthClass="w-[8%]" label="Gestor / Fiscal" field="gestor" current={sortConfig} onSort={handleSort} searchVal={searchGestorFiscal} onSearchChange={setSearchGestorFiscal} />
                                
                                <TextHeader widthClass="w-[5%]" label="Vig. Início" field="data_inic" current={sortConfig} onSort={handleSort} />
                                <TextHeader widthClass="w-[5%]" label="Vig. Fim" field="data_fim" current={sortConfig} onSort={handleSort} />
                                
                                <NumericHeader widthClass="w-[6%]" label="% Tempo" field="perc_tempo" current={sortConfig} onSort={handleSort} numFilters={numFilters} setNumFilters={setNumFilters} align="center" />
                                <NumericHeader widthClass="w-[5%]" label="Passaram" field="dias_passaram" current={sortConfig} onSort={handleSort} numFilters={numFilters} setNumFilters={setNumFilters} align="center" />
                                <NumericHeader widthClass="w-[5%]" label="Faltam" field="encerrando_dias" current={sortConfig} onSort={handleSort} numFilters={numFilters} setNumFilters={setNumFilters} align="center" />
                                
                                <NumericHeader widthClass="w-[6%]" label="Vlr. Global" field="v_global" current={sortConfig} onSort={handleSort} numFilters={numFilters} setNumFilters={setNumFilters} align="right" />
                                <NumericHeader widthClass="w-[6%]" label="Empenhado" field="v_empenhado" current={sortConfig} onSort={handleSort} numFilters={numFilters} setNumFilters={setNumFilters} align="right" />
                                <NumericHeader widthClass="w-[6%]" label="Liquidado" field="v_liquidado" current={sortConfig} onSort={handleSort} numFilters={numFilters} setNumFilters={setNumFilters} align="right" />
                                <NumericHeader widthClass="w-[4%]" label="Liq %" field="p_liquidado" current={sortConfig} onSort={handleSort} numFilters={numFilters} setNumFilters={setNumFilters} align="center" />
                                <NumericHeader widthClass="w-[6%]" label="Pago" field="v_pago" current={sortConfig} onSort={handleSort} numFilters={numFilters} setNumFilters={setNumFilters} align="right" />
                                <NumericHeader widthClass="w-[4%]" label="Pago %" field="p_pago" current={sortConfig} onSort={handleSort} numFilters={numFilters} setNumFilters={setNumFilters} align="center" />
                                <NumericHeader widthClass="w-[6%]" label="Bloqueado" field="v_bloqueado" current={sortConfig} onSort={handleSort} numFilters={numFilters} setNumFilters={setNumFilters} align="right" />
                                <NumericHeader widthClass="w-[4%]" label="Bloq %" field="p_bloqueado" current={sortConfig} onSort={handleSort} numFilters={numFilters} setNumFilters={setNumFilters} align="center" />
                                <NumericHeader widthClass="w-[6%]" label="Cancelado" field="v_cancelado" current={sortConfig} onSort={handleSort} numFilters={numFilters} setNumFilters={setNumFilters} align="right" />
                                <NumericHeader widthClass="w-[4%]" label="Canc %" field="p_cancelado" current={sortConfig} onSort={handleSort} numFilters={numFilters} setNumFilters={setNumFilters} align="center" />
                                <NumericHeader widthClass="w-[6%]" label="Executado" field="v_executado" current={sortConfig} onSort={handleSort} numFilters={numFilters} setNumFilters={setNumFilters} align="right" />
                                <NumericHeader widthClass="w-[4%]" label="Exec %" field="p_executado" current={sortConfig} onSort={handleSort} numFilters={numFilters} setNumFilters={setNumFilters} align="center" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredData.map((row, i) => (
                                <tr key={i} className="hover:bg-blue-50 transition-colors">
                                    <td className="p-3 font-black text-slate-800 whitespace-normal break-words">{row.contrato}</td>
                                    <td className="p-3 text-slate-600 font-bold whitespace-normal break-words leading-tight">{row.fornecedor}</td>
                                    <td className="p-3 text-slate-500 whitespace-normal break-words leading-tight">{row.objeto}</td>
                                    <td className="p-3 whitespace-normal break-words leading-tight">
                                        <div className="font-bold text-slate-700">{row.gestor}</div>
                                        <div className="text-[9px] text-slate-400">{row.fiscal}</div>
                                    </td>
                                    
                                    <td className="p-3 text-slate-500 font-bold whitespace-normal break-words">{row.data_inic || "-"}</td>
                                    <td className="p-3 text-slate-500 font-bold whitespace-normal break-words">{row.data_fim || "-"}</td>
                                    
                                    <td className="p-3 whitespace-normal break-words align-middle">
                                        {row.perc_tempo !== null ? (
                                            <div className="flex items-center gap-1">
                                                <div className="w-full bg-slate-200 rounded-full h-1.5 flex-1 overflow-hidden">
                                                    <div 
                                                        className={`h-1.5 rounded-full ${row.perc_tempo >= 1 ? 'bg-red-500' : 'bg-emerald-500'}`} 
                                                        style={{ width: `${Math.min(Math.max(row.perc_tempo * 100, 0), 100)}%` }}
                                                    ></div>
                                                </div>
                                                <span className="text-[8px] font-bold text-slate-600 min-w-[30px] text-right">
                                                    {formatPercentBR(row.perc_tempo)}
                                                </span>
                                            </div>
                                        ) : "-"}
                                    </td>

                                    <td className="p-3 text-center font-bold text-slate-600 whitespace-normal break-words">
                                        {row.dias_passaram !== null ? `${row.dias_passaram} d` : "-"}
                                    </td>

                                    <td className={`p-3 text-center font-bold whitespace-normal break-words ${row.encerrando_dias < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                        {row.encerrando_dias !== null ? `${row.encerrando_dias} d` : "-"}
                                    </td>

                                    <td className="p-3 text-right font-bold text-slate-700 whitespace-normal break-words bg-slate-50/30">{formatBRL(row.v_global)}</td>
                                    <td className="p-3 text-right font-bold text-blue-700 whitespace-normal break-words">{formatBRL(row.v_empenhado)}</td>
                                    <td className="p-3 text-right font-bold text-amber-600 whitespace-normal break-words">{formatBRL(row.v_liquidado)}</td>
                                    <td className="p-3 text-center font-bold opacity-70 whitespace-normal break-words bg-slate-50/50">{formatPercentBR(row.p_liquidado)}</td>
                                    <td className="p-3 text-right font-black text-emerald-600 whitespace-normal break-words">{formatBRL(row.v_pago)}</td>
                                    <td className="p-3 text-center font-bold opacity-70 whitespace-normal break-words bg-slate-50/50">{formatPercentBR(row.p_pago)}</td>
                                    <td className="p-3 text-right font-bold text-rose-600 whitespace-normal break-words">{formatBRL(row.v_bloqueado)}</td>
                                    <td className="p-3 text-center font-bold opacity-70 whitespace-normal break-words bg-slate-50/50">{formatPercentBR(row.p_bloqueado)}</td>
                                    <td className="p-3 text-right font-bold text-red-600 whitespace-normal break-words">{formatBRL(row.v_cancelado)}</td>
                                    <td className="p-3 text-center font-bold opacity-70 whitespace-normal break-words bg-slate-50/50">{formatPercentBR(row.p_cancelado)}</td>
                                    <td className="p-3 text-right font-black text-blue-600 whitespace-normal break-words">{formatBRL(row.v_executado)}</td>
                                    <td className="p-3 text-center font-black text-blue-800 whitespace-normal break-words bg-slate-50/50">{formatPercentBR(row.p_executado)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="sticky bottom-0 z-10">
                            <tr className="bg-slate-100 border-t-2 border-slate-300 font-black text-[10px] text-slate-700">
                                <td className="p-2 text-left" colSpan="10">TOTAIS</td>
                                <td className="p-2 text-right bg-blue-50">{formatBRL(tableTotals.empenhado)}</td>
                                <td className="p-2 text-right bg-amber-50">{formatBRL(tableTotals.liquidado)}</td>
                                <td className="p-2 text-center bg-slate-50">—</td>
                                <td className="p-2 text-right bg-emerald-50">{formatBRL(tableTotals.pago)}</td>
                                <td className="p-2 text-center bg-slate-50">—</td>
                                <td className="p-2 text-right bg-rose-50">{formatBRL(tableTotals.bloqueado)}</td>
                                <td className="p-2 text-center bg-slate-50">—</td>
                                <td className="p-2 text-right bg-red-50">{formatBRL(tableTotals.cancelado)}</td>
                                <td className="p-2 text-center bg-slate-50">—</td>
                                <td className="p-2 text-right bg-slate-50">—</td>
                                <td className="p-2 text-center bg-slate-50">—</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
}

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(() => safeLocalStorageGet(LOCAL_STORAGE_KEYS.auth) === 'true');
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const handleLogin = (e) => {
        e.preventDefault();
        
        const usersBinary = {
            '01100010 01110010 01101001 01110100 01101111': '00110001 00110110 00110110 00111001', // brito : 1669
            '01100111 01100101 01110011 01110100 01101111 01110010': '00110000 00110001 00110000 00110001', // gestor : 0101
            '01100110 01101001 01110011 01100011 01100001 01101100': '00110000 00110010 00110000 00110010', // fiscal : 0202
            '01100001 01101100 01101101 01100101 01110010 01101001 01100001': '00110010 00110000 00110000 00110010', // almeria : 2002
            '01100010 01101111 01110101 01101100 01100101 01110110 01100001 01110010 01100100': '00110000 00110001 00110011 00110110' // boulevard : 0136
        };

        const users = {};
        Object.keys(usersBinary).forEach(binUser => {
            users[decodeBinary(binUser)] = decodeBinary(usersBinary[binUser]);
        });

        const inputUser = username.toLowerCase().trim();
        const inputPass = password.trim();

        if (users[inputUser] && users[inputUser] === inputPass) {
            setIsAuthenticated(true);
            safeLocalStorageSet(LOCAL_STORAGE_KEYS.auth, 'true');
            setError("");
        } else {
            setError("Credenciais inválidas. Verifique o usuário e a senha.");
        }
    };

    const handleLogout = () => {
        safeLocalStorageRemove(LOCAL_STORAGE_KEYS.auth);
        setIsAuthenticated(false);
        setPassword("");
        setError("");
    };

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-800 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                <div className="bg-white p-8 rounded-2xl shadow-2xl w-[400px] max-w-[90%] border-t-8 border-blue-600 relative z-10">
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter leading-tight">Acesso Restrito</h1>
                        <p className="text-xs font-bold text-slate-500 mt-2 uppercase tracking-widest">Painel Geral de Contratos</p>
                    </div>
                    <form onSubmit={handleLogin} className="space-y-5">
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Usuário</label>
                            <input 
                                type="text" 
                                value={username} 
                                onChange={e => setUsername(e.target.value)} 
                                className="w-full border border-slate-300 px-3 py-3 rounded text-sm font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-slate-50 transition-all" 
                                placeholder="Digite o seu usuário..."
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Senha</label>
                            <input 
                                type="password" 
                                value={password} 
                                onChange={e => setPassword(e.target.value)} 
                                className="w-full border border-slate-300 px-3 py-3 rounded text-sm font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-slate-50 transition-all" 
                                placeholder="••••••••"
                            />
                        </div>
                        {error && (
                            <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded">
                                <p className="text-[11px] font-bold text-red-600 text-center">{error}</p>
                            </div>
                        )}
                        <button 
                            type="submit" 
                            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-black uppercase text-[11px] tracking-widest py-4 rounded transition-colors shadow-lg mt-2"
                        >
                            Autenticar Acesso
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return <Dashboard onLogout={handleLogout} />;
}

ReactDOM.render(<App />, document.getElementById('root'));
