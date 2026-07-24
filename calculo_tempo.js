'use strict';

/* =========================================================================
   CALCULADORA DE TEMPO DE SERVIÇO — MOTOR DE CÁLCULO
   Etapa 2 / Bloco 1: constantes e utilitários de data
   ========================================================================= */


/* ---------------------------------------------------------------
   1. CONSTANTES
   Convenção travada: 1 ano = 365 dias, contagem inclusiva.
   --------------------------------------------------------------- */

const DIAS_ANO          = 365;      // substitui os antigos 365,25
const DIAS_30_ANOS      = 10950;    // 30 × 365  (era o par inconsistente 10950/10958)
const DIAS_35_ANOS      = 12775;    // 35 × 365 — regra de quem entrou depois da Lei
const TETO_AVERB_CIVIL  = 1825;     //  5 × 365  (era 1826,25 / 1826,3)
const TAXA_PEDAGIO      = 0.17;
const MESES_PEDAGIO_MAX = 60;

const IDADE_MINIMA_ANOS = 18;       // validação do campo Data de nascimento
const IDADE_REFORMA     = 67;       // reforma compulsória (aposentadoria automática)

const MS_POR_DIA = 86400000;        // 24 × 60 × 60 × 1000

// Data de corte da Lei. Atenção ao mês: em JS janeiro = 0, logo dezembro = 11.
const DATA_LEI = new Date(2021, 11, 31);


/* ---------------------------------------------------------------
   2. UTILITÁRIOS DE DATA

   Toda a camada de datas passa por aqui. Nenhuma outra função do
   sistema deve manipular Date diretamente.
   --------------------------------------------------------------- */

/**
 * Converte uma Date local para o instante de meia-noite UTC do MESMO dia
 * do calendário. É o que neutraliza fuso horário e horário de verão.
 *
 * Lemos os componentes em horário LOCAL (getFullYear/getMonth/getDate),
 * que é o dia que o usuário enxerga, e remontamos em UTC. Assim duas datas
 * quaisquer viram dois inteiros na mesma régua, sem dias de 23h ou 25h.
 */
function paraMeiaNoiteUTC(data) {
  return Date.UTC(data.getFullYear(), data.getMonth(), data.getDate());
}

/**
 * Converte a string do <input type="date"> ("2011-03-21") em Date LOCAL.
 *
 * Por que não usar new Date(texto): a especificação manda interpretar o
 * formato "aaaa-mm-dd" como UTC. Em Brasília (UTC-3) isso resulta no dia
 * anterior às 21h. Quebrando a string manualmente, o dia fica correto.
 */
function dataDeISO(texto) {
  if (!texto) return null;
  const [ano, mes, dia] = texto.split('-').map(Number);
  return new Date(ano, mes - 1, dia);   // mes - 1: JS conta meses de 0 a 11
}

/**
 * Diferença entre duas datas em dias, CONTANDO OS DOIS EXTREMOS.
 * Equivale ao "fim - inicio + 1" das fórmulas I10, I13 e I14 da planilha.
 *
 * Ex.: 01/03/2010 a 28/02/2011 → 365 dias
 */
function diferencaInclusiva(inicio, fim) {
  const bruto = (paraMeiaNoiteUTC(fim) - paraMeiaNoiteUTC(inicio)) / MS_POR_DIA;
  return Math.round(bruto) + 1;   // round elimina resíduo de fração de ms
}

/**
 * Soma (ou subtrai, com valor negativo) uma quantidade de dias a uma data.
 * Devolve sempre uma nova Date — nunca altera a original.
 */
function somarDias(data, dias) {
  const resultado = new Date(paraMeiaNoiteUTC(data) + dias * MS_POR_DIA);
  return new Date(
    resultado.getUTCFullYear(),
    resultado.getUTCMonth(),
    resultado.getUTCDate()
  );
}

/**
 * Formata para exibição no padrão brasileiro: dd/mm/aaaa
 */
function formatarData(data) {
  if (!data || isNaN(data)) return '';
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${data.getFullYear()}`;
}

/**
 * Formata para "aaaa-mm-dd" (min/max de <input type="date">), lendo os
 * componentes em horário LOCAL. Não usar Date#toISOString: ela converte
 * para UTC e devolve o dia anterior em fusos negativos como o do Brasil.
 */
function paraISOData(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/**
 * Data de hoje, zerada na meia-noite LOCAL.
 * Equivale ao TODAY() da planilha (célula A1).
 */
function hoje() {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
}

/**
 * Soma N anos de CALENDÁRIO a uma data (aniversário real, não a convenção
 * de 365 dias usada no resto do sistema). Idade de pessoa segue o
 * calendário — usar 365 dias fixos derivaria até 1 dia por ano bissexto.
 * 29/fev sem correspondente no ano de destino cai em 1/mar (comportamento
 * nativo do JS), o que é o padrão comum para esse caso.
 */
function adicionarAnos(data, anos) {
  return new Date(data.getFullYear() + anos, data.getMonth(), data.getDate());
}

/**
 * Idade em anos completos na data de referência, respeitando se o
 * aniversário do ano já ocorreu ou não.
 */
function calcularIdade(nascimento, referencia) {
  let idade = referencia.getFullYear() - nascimento.getFullYear();
  const aniversarioAindaNaoChegou =
        (referencia.getMonth() < nascimento.getMonth()) ||
        (referencia.getMonth() === nascimento.getMonth() &&
         referencia.getDate() < nascimento.getDate());
  if (aniversarioAindaNaoChegou) idade--;
  return idade;
}


/* ---------------------------------------------------------------
   3. NORMALIZAÇÃO DAS ENTRADAS

   Cada averbação chega como {anos, dias} e vira um total em dias.
   Regra: total = anos × 365 + dias   (convenção travada)
   --------------------------------------------------------------- */

function averbacaoEmDias(anos, dias) {
  return (anos * DIAS_ANO) + dias;
}


/* ---------------------------------------------------------------
   4. MOTOR — variáveis intermediárias

   Recebe as entradas já validadas e devolve um objeto com todas as
   grandezas em DIAS. A ordem das atribuições respeita a cadeia de
   dependência: cada linha só usa o que foi calculado acima dela.

   entradas = {
     dataPraca,          Date
     diasAfastamento,    int
     averbMilitar,       int  (já normalizado em dias)
     averbCivil,         int  (já normalizado em dias)
     dataReferencia      Date (hoje, por padrão — injetável para testes)
   }
   --------------------------------------------------------------- */

function calcularIntermediarias(entradas) {
  const { dataPraca, diasAfastamento, averbMilitar, averbCivil, dataReferencia } = entradas;

  // Regra dos 35 anos: quem entrou DEPOIS da Lei nunca existiu no regime
  // de transição. "dias na corporação até a Lei" seria negativo (praça
  // posterior ao corte) — as contas que dependem da Lei ficam nulas e o
  // ramo de saídas usa um cálculo à parte (ver calcularSaidas).
  const regimePosLei = paraMeiaNoiteUTC(dataPraca) > paraMeiaNoiteUTC(DATA_LEI);

  // I9 e I11 — averbações (chegam já em dias)
  const diasAverbMilitar = averbMilitar;
  const diasAverbCivil   = averbCivil;

  // J10 — averbação civil (INSS) limitada ao teto de 5 anos
  const diasCivilComputaveis = Math.min(diasAverbCivil, TETO_AVERB_CIVIL);

  // F10 (parcial) — tempo de contribuição militar ATUAL, contado até a referência
  const diasServicoHoje =
        diferencaInclusiva(dataPraca, dataReferencia) - diasAfastamento + diasAverbMilitar;

  if (regimePosLei) {
    return {
      regimePosLei,
      diasCorporacaoAteLei: null,
      diasAverbMilitar,
      diasAverbCivil,
      diasCivilComputaveis,
      diasMilitarAteLei: null,
      diasTotaisAteLei: null,
      diasFaltantes30: null,
      diasPedagio: null,
      diasRestantesInatividade: null,
      mesesPedagioContribuicao: null,
      diasServicoHoje
    };
  }

  // I10 — dias na corporação, da praça até a data da Lei, menos afastamentos.
  // diferencaInclusiva já embute o "+1" da planilha.
  const diasCorporacaoAteLei =
        diferencaInclusiva(dataPraca, DATA_LEI) - diasAfastamento;

  // I13 — tempo militar até a Lei (corporação + averbação militar)
  const diasMilitarAteLei = diasCorporacaoAteLei + diasAverbMilitar;

  // I14 — tempo total até a Lei (militar + civil, este SEM teto, como na planilha)
  const diasTotaisAteLei = diasMilitarAteLei + diasAverbCivil;

  // I15 — dias que faltam para 30 anos, medidos na data da Lei (nunca negativo)
  const diasFaltantes30 = Math.max(0, DIAS_30_ANOS - diasTotaisAteLei);

  // I16 — PEDÁGIO de 17%, arredondado PARA BAIXO (decisão do DCP)
  const diasPedagio = Math.trunc(diasFaltantes30 * TAXA_PEDAGIO);

  // I18 — total de dias restantes até a inatividade (faltantes + pedágio)
  const diasRestantesInatividade = diasFaltantes30 + diasPedagio;

  // C16 — pedágio de contribuição em meses: 4 meses por ano faltante, teto de 60
  const anosFaltantes = Math.trunc(diasFaltantes30 / DIAS_ANO);
  const mesesPedagioContribuicao = Math.min(MESES_PEDAGIO_MAX, anosFaltantes * 4);

  return {
    regimePosLei,
    diasCorporacaoAteLei,
    diasAverbMilitar,
    diasAverbCivil,
    diasCivilComputaveis,
    diasMilitarAteLei,
    diasTotaisAteLei,
    diasFaltantes30,
    diasPedagio,
    diasRestantesInatividade,
    mesesPedagioContribuicao,
    diasServicoHoje
  };
}


/* ---------------------------------------------------------------
   5. DECOMPOSIÇÃO DE SAÍDA

   Converte um total em dias para {anos, dias}, na convenção travada
   (1 ano = 365 dias). NÃO exibimos meses: com 365/30, restos entre
   360 e 364 gerariam "12 meses", que é inválido.
   --------------------------------------------------------------- */

function decompor(totalDias) {
  const anos = Math.trunc(totalDias / DIAS_ANO);
  const dias = totalDias - (anos * DIAS_ANO);
  return { anos, dias };
}

/** Formata {anos, dias} para texto legível. */
function formatarTempo(totalDias) {
  const { anos, dias } = decompor(totalDias);
  return `${anos} ano(s) e ${dias} dia(s)`;
}


/* ---------------------------------------------------------------
   6. SAÍDAS FINAIS

   Recebe as entradas + as intermediárias e produz o que aparece na
   tela. Cada saída aponta para a célula equivalente da planilha.
   --------------------------------------------------------------- */

function calcularSaidas(entradas, m) {
  const { dataPraca, dataNascimento } = entradas;

  let deslocamentoDias, diasServicoTotal, diasComPedagio, diasPedagioSaida;

  if (m.regimePosLei) {
    // Praça depois da Lei: regime novo, sem transição. Prazo fixo de 35
    // anos, abatido apenas pela averbação (militar integral, civil com o
    // mesmo teto de 5 anos usado no resto do sistema). Não há pedágio nem
    // "tempo de serviço até a Lei" — essas métricas não existem para quem
    // ainda não tinha entrado na corporação em 31/12/2021.
    deslocamentoDias = DIAS_35_ANOS - m.diasAverbMilitar - m.diasCivilComputaveis;
    diasServicoTotal = null;
    diasComPedagio   = null;
    diasPedagioSaida = null;

  } else {
    // ----- C5: DATA PREVISTA DA RESERVA -----
    // Três ramos, exatamente como a planilha (decisão de norma confirmada):
    if (m.diasFaltantes30 === 0) {
      // RAMO 1 — já tinha 30 anos na data da Lei.
      // Sem pedágio E sem teto no civil (regime fora da transição).
      deslocamentoDias = DIAS_30_ANOS - m.diasAverbMilitar - m.diasAverbCivil;

    } else if (m.diasAverbCivil <= TETO_AVERB_CIVIL) {
      // RAMO 2 — na transição, civil dentro do teto (integral = limitado).
      deslocamentoDias =
          DIAS_30_ANOS + m.diasPedagio - m.diasAverbMilitar - m.diasAverbCivil;

    } else {
      // RAMO 3 — na transição, civil acima do teto: usa o civil LIMITADO.
      deslocamentoDias =
          DIAS_30_ANOS + m.diasPedagio - m.diasAverbMilitar - m.diasCivilComputaveis;
    }

    // ----- C11: TEMPO DE SERVIÇO TOTAL -----
    // Aqui o teto de 5 anos SE APLICA ao civil (regra de averbação).
    diasServicoTotal = m.diasCorporacaoAteLei + m.diasAverbMilitar + m.diasCivilComputaveis;

    // ----- C7: TEMPO TOTAL COM PEDÁGIO -----
    // Teto em 30 anos: quem já passou, fixa em 30.
    diasComPedagio =
          m.diasTotaisAteLei >= DIAS_30_ANOS
            ? DIAS_30_ANOS
            : m.diasTotaisAteLei + m.diasFaltantes30 + m.diasPedagio;

    diasPedagioSaida = m.diasPedagio;
  }

  const dataPrevistaReservaCalculada = somarDias(dataPraca, deslocamentoDias);

  // ----- REFORMA COMPULSÓRIA AOS 67 ANOS -----
  // Se a reserva calculada só chegaria depois dos 67 anos de idade, a
  // reforma é automática na data do aniversário de 67 — a pessoa é
  // desligada ali, mesmo sem ter completado o tempo de serviço. Proventos
  // proporcionais ficam fora do escopo deste simulador.
  const dataLimite67 = adicionarAnos(dataNascimento, IDADE_REFORMA);
  const aposentadoriaCompulsoria =
        paraMeiaNoiteUTC(dataPrevistaReservaCalculada) > paraMeiaNoiteUTC(dataLimite67);
  const dataPrevistaReserva = aposentadoriaCompulsoria
        ? dataLimite67
        : dataPrevistaReservaCalculada;

  const idadeNaReserva = calcularIdade(dataNascimento, dataPrevistaReserva);

  return {
    dataPrevistaReserva,
    aposentadoriaCompulsoria,
    idadeNaReserva,
    tempoServicoTotal:    diasServicoTotal === null ? null : decompor(diasServicoTotal),
    tempoComPedagio:      diasComPedagio   === null ? null : decompor(diasComPedagio),
    tempoContribuicaoHoje: decompor(m.diasServicoHoje),
    pedagioTempoServico:  diasPedagioSaida === null ? null : decompor(diasPedagioSaida),
    diasFaltantes30:      m.diasFaltantes30,
    mesesPedagioContribuicao: m.mesesPedagioContribuicao
  };
}


/* ---------------------------------------------------------------
   7. FUNÇÃO PRINCIPAL — orquestra tudo
   --------------------------------------------------------------- */

function calcular(entradasBrutas) {
  const entradas = {
    dataPraca:       entradasBrutas.dataPraca,
    dataNascimento:  entradasBrutas.dataNascimento,
    diasAfastamento: entradasBrutas.diasAfastamento || 0,
    averbMilitar:    averbacaoEmDias(entradasBrutas.averbMilitarAnos || 0,
                                     entradasBrutas.averbMilitarDias || 0),
    averbCivil:      averbacaoEmDias(entradasBrutas.averbCivilAnos || 0,
                                     entradasBrutas.averbCivilDias || 0),
    dataReferencia:  entradasBrutas.dataReferencia || hoje()
  };

  const intermediarias = calcularIntermediarias(entradas);
  const saidas         = calcularSaidas(entradas, intermediarias);

  return { entradas, intermediarias, saidas };
}


/* ---------------------------------------------------------------
   Exporta para uso em Node (testes). No navegador estas linhas são
   ignoradas — as funções ficam disponíveis no escopo global.
   --------------------------------------------------------------- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calcular, calcularIntermediarias, calcularSaidas,
    decompor, formatarTempo, averbacaoEmDias,
    diferencaInclusiva, somarDias, dataDeISO, formatarData, paraISOData, hoje,
    adicionarAnos, calcularIdade,
    DIAS_ANO, DIAS_30_ANOS, DIAS_35_ANOS, TETO_AVERB_CIVIL, DATA_LEI,
    IDADE_MINIMA_ANOS, IDADE_REFORMA
  };
}


/* =========================================================================
   ETAPA 4 — LIGAÇÃO DOM ↔ FUNÇÕES
   Só roda no navegador (o bloco de module.exports acima é que atende o Node).
   ========================================================================= */
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function () {

    const form = document.getElementById('form-calculo');
    const campoDataNascimento = document.getElementById('dataNascimento');
    const campoDataPraca = document.getElementById('dataPraca');
    const campoDiasAfastamento = document.getElementById('diasAfastamento');
    const campoAverbMilitarAnos = document.getElementById('averbMilitarAnos');
    const campoAverbMilitarDias = document.getElementById('averbMilitarDias');
    const campoAverbCivilAnos = document.getElementById('averbCivilAnos');
    const campoAverbCivilDias = document.getElementById('averbCivilDias');

    const consolidadoMilitar = document.querySelector('#consolidadoMilitar .num');
    const consolidadoCivil = document.querySelector('#consolidadoCivil .num');

    const saidaDataReserva = document.getElementById('saidaDataReserva');
    const saidaIdadeReserva = document.getElementById('saidaIdadeReserva');
    const saidaTempoComPedagio = document.getElementById('saidaTempoComPedagio');
    const saidaTempoServicoTotal = document.getElementById('saidaTempoServicoTotal');
    const saidaContribuicaoHoje = document.getElementById('saidaContribuicaoHoje');
    const saidaPedagio = document.getElementById('saidaPedagio');
    const avisoCompulsoria = document.getElementById('avisoCompulsoria');

    const reguaCaixa = document.querySelector('.regua-caixa');
    const regua = document.getElementById('regua');
    const faixaPedagio = regua.querySelector('.faixa-ped');

    const btnLimpar = document.getElementById('btnLimpar');

    /** Data de nascimento: idade hoje precisa estar entre 18 e 67 anos. */
    function definirLimitesNascimento() {
      const hojeVal = hoje();
      const maisVelhoPermitido = adicionarAnos(hojeVal, -IDADE_REFORMA);
      const maisNovoPermitido  = adicionarAnos(hojeVal, -IDADE_MINIMA_ANOS);
      campoDataNascimento.min = paraISOData(maisVelhoPermitido);
      campoDataNascimento.max = paraISOData(maisNovoPermitido);
    }

    /** Lê um <input type="number"> como inteiro não negativo (vazio/NaN → 0). */
    function lerInteiro(campo) {
      const valor = parseInt(campo.value, 10);
      return Number.isNaN(valor) ? 0 : valor;
    }

    /** Formata {anos, dias} (retorno já decomposto de calcularSaidas) como texto. */
    function textoTempo(decomposto) {
      if (decomposto === null) return 'Não se aplica';
      return `${decomposto.anos} ano(s) e ${decomposto.dias} dia(s)`;
    }

    /** Atualiza os totais consolidados exibidos abaixo de cada par anos/dias. */
    function atualizarConsolidados() {
      const totalMilitar = averbacaoEmDias(
        lerInteiro(campoAverbMilitarAnos), lerInteiro(campoAverbMilitarDias));
      const totalCivil = averbacaoEmDias(
        lerInteiro(campoAverbCivilAnos), lerInteiro(campoAverbCivilDias));

      consolidadoMilitar.textContent = formatarTempo(totalMilitar);
      consolidadoCivil.textContent = formatarTempo(totalCivil);
    }

    /**
     * Posiciona as faixas da régua via variáveis CSS (--p-corp, --p-mil, --p-civ,
     * --p-ped, --p-marca). Corp + mil + civ ficam grudadas (flex), mas o pedágio
     * só começa na marca dos 30 anos — por isso ganha um margin-left equivalente
     * ao tempo que ainda falta (m.diasFaltantes30), deixando o padrão de fundo
     * visível nesse trecho como "o que falta cumprir".
     */
    function atualizarRegua(m) {
      // A régua representa o regime de transição (marca dos 30 anos +
      // pedágio). Quem entrou depois da Lei está na regra dos 35 anos, que
      // não tem nem "faltantes30" nem pedágio — a régua não se aplica.
      if (m.regimePosLei) {
        reguaCaixa.hidden = true;
        return;
      }
      reguaCaixa.hidden = false;

      const escalaTotal = Math.max(DIAS_30_ANOS, m.diasTotaisAteLei) + m.diasPedagio;

      const percentual = (dias) => `${(dias / escalaTotal) * 100}%`;

      regua.style.setProperty('--p-corp', percentual(m.diasCorporacaoAteLei));
      regua.style.setProperty('--p-mil', percentual(m.diasAverbMilitar));
      regua.style.setProperty('--p-civ', percentual(m.diasAverbCivil));
      regua.style.setProperty('--p-ped', percentual(m.diasPedagio));
      regua.style.setProperty('--p-marca', percentual(DIAS_30_ANOS));
      faixaPedagio.style.marginLeft = percentual(m.diasFaltantes30);
    }

    function limparRegua() {
      reguaCaixa.hidden = false;
      ['--p-corp', '--p-mil', '--p-civ', '--p-ped'].forEach(
        (nome) => regua.style.setProperty(nome, '0%'));
      regua.style.setProperty('--p-marca', '100%');
      faixaPedagio.style.marginLeft = '0';
    }

    function aoSubmeter(evento) {
      evento.preventDefault();
      if (!form.reportValidity()) return;

      const resultado = calcular({
        dataPraca: dataDeISO(campoDataPraca.value),
        dataNascimento: dataDeISO(campoDataNascimento.value),
        diasAfastamento: lerInteiro(campoDiasAfastamento),
        averbMilitarAnos: lerInteiro(campoAverbMilitarAnos),
        averbMilitarDias: lerInteiro(campoAverbMilitarDias),
        averbCivilAnos: lerInteiro(campoAverbCivilAnos),
        averbCivilDias: lerInteiro(campoAverbCivilDias)
      });

      const { saidas, intermediarias } = resultado;

      saidaDataReserva.textContent = formatarData(saidas.dataPrevistaReserva);
      saidaIdadeReserva.textContent = `${saidas.idadeNaReserva} ano(s)`;
      saidaTempoComPedagio.textContent = textoTempo(saidas.tempoComPedagio);
      saidaTempoServicoTotal.textContent = textoTempo(saidas.tempoServicoTotal);
      saidaContribuicaoHoje.textContent = textoTempo(saidas.tempoContribuicaoHoje);
      saidaPedagio.textContent = textoTempo(saidas.pedagioTempoServico);
      avisoCompulsoria.hidden = !saidas.aposentadoriaCompulsoria;

      atualizarRegua(intermediarias);
    }

    function aoLimpar() {
      form.reset();
      atualizarConsolidados();
      limparRegua();
      avisoCompulsoria.hidden = true;

      [saidaDataReserva, saidaIdadeReserva, saidaTempoComPedagio, saidaTempoServicoTotal,
       saidaContribuicaoHoje, saidaPedagio].forEach((el) => { el.textContent = '—'; });
    }

    form.addEventListener('submit', aoSubmeter);
    btnLimpar.addEventListener('click', aoLimpar);

    [campoAverbMilitarAnos, campoAverbMilitarDias,
     campoAverbCivilAnos, campoAverbCivilDias].forEach(
      (campo) => campo.addEventListener('input', atualizarConsolidados));

    definirLimitesNascimento();
    atualizarConsolidados();
    limparRegua();

    /* -----------------------------------------------------------
       CALCULADORA DE DIAS ENTRE DATAS — ícone flutuante + modal,
       independente do formulário principal. Reaproveita
       diferencaInclusiva/dataDeISO já definidas no topo do arquivo.
       ----------------------------------------------------------- */
    const gatilhosAbrirDias = document.querySelectorAll('.gatilho-dias-entre');
    const modalDias = document.getElementById('modalDiasEntreDatas');
    const btnFecharDias = document.getElementById('btnFecharDiasEntreDatas');
    const btnCalcularDias = document.getElementById('btnCalcularDiasEntre');
    const campoDiasEntreInicio = document.getElementById('diasEntreInicio');
    const campoDiasEntreFim = document.getElementById('diasEntreFim');
    const resultadoDiasEntre = document.getElementById('resultadoDiasEntre');
    const resultadoDiasEntreValor = document.getElementById('resultadoDiasEntreValor');

    function abrirModalDias() {
      campoDiasEntreInicio.value = '';
      campoDiasEntreFim.value = '';
      resultadoDiasEntre.hidden = true;
      modalDias.showModal();
    }

    function calcularDiasEntreDatas() {
      const a = dataDeISO(campoDiasEntreInicio.value);
      const b = dataDeISO(campoDiasEntreFim.value);
      if (!a || !b) return;

      // Ordem dos campos não importa: usa a menor como início.
      const inicio = a <= b ? a : b;
      const fim = a <= b ? b : a;

      resultadoDiasEntreValor.textContent = diferencaInclusiva(inicio, fim);
      resultadoDiasEntre.hidden = false;
    }

    gatilhosAbrirDias.forEach((el) => el.addEventListener('click', abrirModalDias));
    btnFecharDias.addEventListener('click', () => modalDias.close());
    btnCalcularDias.addEventListener('click', calcularDiasEntreDatas);

    // Fecha ao clicar fora do cartão (na área do backdrop do <dialog>).
    modalDias.addEventListener('click', (evento) => {
      if (evento.target === modalDias) modalDias.close();
    });
  });
}
