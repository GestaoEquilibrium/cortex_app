/* ============================================================================
   CORTEX · Laudo Online — EXPLICAÇÕES PARA A FAMÍLIA  (shared/laudo/laudo_explica.js)
   ----------------------------------------------------------------------------
   Biblioteca dos balões da página online: para cada medida (índice, subteste,
   tentativa do RAVLT, tempo do FDT, fator da BFP, subescala de escala) diz
   "o que é", em linguagem simples e com exemplo do dia a dia, e "no dia a dia",
   conforme a faixa do resultado.

   O texto é GERAL para aquela faixa ("costuma", "pode"): não afirma nada sobre o
   caso que o laudo não diga. A análise do caso continua no texto do laudo.

   Uso: LaudoExplica.de('idx:IMO', 'dificuldade', 'Lucas') → { oque, vida }
        níveis: 'dificuldade' · 'esperado' · 'forte'  (BFP: 'baixo' · 'medio' · 'alto')
   ============================================================================ */
(function () {
    'use strict';

    const IDX = {
        ICV: { oque: 'Mostra como a pessoa usa as palavras para pensar: entender o que ouve e lê, explicar uma ideia, perceber o que duas coisas têm em comum. Ex.: explicar por que o gato e o cachorro são parecidos.',
            dificuldade: '{nome} pode ter mais trabalho para entender explicações longas e para colocar o que pensa em palavras. Explicações curtas, com exemplo, costumam ajudar.',
            esperado: 'Para a idade, {nome} entende e usa as palavras para raciocinar como a maioria das pessoas.',
            forte: 'Entender, explicar e argumentar com palavras é um ponto forte de {nome}, e pode servir de apoio para outras áreas.' },
        IOP: { oque: 'Mostra o raciocínio com imagens e formas: perceber padrões, montar e resolver problemas novos sem depender de palavras. Ex.: montar um quebra-cabeça ou entender um mapa.',
            dificuldade: '{nome} pode ter mais trabalho com tarefas visuais, como montar, desenhar figuras geométricas ou se orientar por mapas e gráficos.',
            esperado: 'Para a idade, {nome} raciocina com imagens e formas como a maioria das pessoas.',
            forte: 'Raciocinar com imagens é um ponto forte de {nome}. Esquemas, desenhos e mapas mentais costumam ajudar a aprender.' },
        IMO: { oque: 'É a “mesa de trabalho” da cabeça: segurar uma informação por alguns segundos enquanto usa ela. Ex.: fazer uma conta de cabeça ou guardar um recado até chegar em casa.',
            dificuldade: '{nome} pode esquecer recados no caminho, se perder em instruções com várias partes e ter mais trabalho com contas de cabeça. Anotar e dar uma instrução por vez costuma ajudar.',
            esperado: 'Para a idade, {nome} segura e usa informações de cabeça como a maioria das pessoas.',
            forte: '{nome} tem facilidade para segurar e usar informações de cabeça, o que ajuda em contas mentais e em seguir várias instruções.' },
        IVP: { oque: 'É a rapidez para fazer tarefas simples sem errar, como copiar, conferir e marcar.',
            dificuldade: '{nome} pode demorar mais que os colegas para copiar do quadro e terminar provas e tarefas. Não é falta de capacidade: costuma precisar de um pouco mais de tempo.',
            esperado: 'Para a idade, {nome} trabalha em tarefas simples na mesma velocidade que a maioria das pessoas.',
            forte: '{nome} é rápido(a) e preciso(a) em tarefas simples, como copiar e conferir.' },
        QIT: { oque: 'É um número que resume todas as tarefas do teste de inteligência. A média da população é 100, e a maioria das pessoas fica entre 90 e 109.',
            dificuldade: 'O resultado geral ficou abaixo da média para a idade. O texto do laudo explica em quais áreas está a maior dificuldade.',
            esperado: 'O resultado geral de {nome} está na média para a idade. Quando há dificuldades, elas costumam estar em pontos específicos, e não na inteligência como um todo.',
            forte: 'O resultado geral de {nome} ficou acima da média para a idade.' },
        ICG: { oque: 'É um resumo do raciocínio que deixa de fora a memória de trabalho e a velocidade. É usado quando as áreas variam muito entre si e o QI Total deixa de representar bem a pessoa.',
            dificuldade: 'Mesmo sem contar memória e velocidade, o raciocínio ficou abaixo da média para a idade.',
            esperado: 'Sem contar memória e velocidade, o raciocínio de {nome} está dentro do esperado para a idade.',
            forte: 'Sem contar memória e velocidade, o raciocínio de {nome} ficou acima da média. As dificuldades estão em memória ou velocidade, e não no raciocínio.' },
        ICC: { oque: 'Junta a memória de trabalho e a velocidade: o quanto a pessoa consegue segurar e processar informação com rapidez.',
            dificuldade: 'Segurar informação e trabalhar com rapidez é o ponto que mais pesa para {nome} no dia a dia.',
            esperado: 'Memória de trabalho e velocidade, juntas, estão dentro do esperado para a idade.',
            forte: 'Memória de trabalho e velocidade, juntas, são um ponto forte de {nome}.' },
        QIV: { oque: 'Resume as tarefas que usam palavras, conhecimentos e memória de trabalho.',
            dificuldade: 'As tarefas com palavras e conhecimentos ficaram abaixo da média para a idade.',
            esperado: 'As tarefas com palavras e conhecimentos ficaram na média para a idade.',
            forte: 'As tarefas com palavras e conhecimentos ficaram acima da média.' },
        QIE: { oque: 'Resume as tarefas práticas, com figuras, formas e velocidade.',
            dificuldade: 'As tarefas práticas, com figuras e velocidade, ficaram abaixo da média para a idade.',
            esperado: 'As tarefas práticas, com figuras e velocidade, ficaram na média para a idade.',
            forte: 'As tarefas práticas, com figuras e velocidade, ficaram acima da média.' }
    };
    IDX.QI_TOTAL = IDX.QIT; IDX.QI_VERBAL = IDX.QIV; IDX.QI_EXECUCAO = IDX.QIE;

    const SUB = {
        SM: 'Dizer o que duas coisas têm em comum. Ex.: em que a maçã e a banana se parecem.',
        VC: 'Explicar o significado de palavras.',
        CO: 'Responder o que fazer em situações do dia a dia e por que as regras existem.',
        IN: 'Conhecimentos gerais aprendidos na escola e na vida.',
        RP: 'Descobrir de que coisa se fala a partir de pistas.',
        CB: 'Montar com blocos coloridos um desenho mostrado num modelo.',
        CN: 'Escolher figuras que combinam por terem algo em comum.',
        RM: 'Completar uma sequência de figuras descobrindo a lógica dela.',
        CF: 'Descobrir o que está faltando numa figura.',
        AF: 'Colocar figuras em ordem para contar uma história.',
        AO: 'Montar peças para formar um objeto, como um quebra-cabeça.',
        DG: 'Repetir sequências de números, na mesma ordem e de trás para frente.',
        SNL: 'Ouvir números e letras misturados e repetir colocando cada um em ordem.',
        AR: 'Resolver problemas de matemática de cabeça, sem papel.',
        CD: 'Copiar símbolos ligados a números o mais rápido possível, sem errar.',
        PS: 'Procurar rapidamente se um símbolo aparece num grupo.',
        CA: 'Marcar figuras de um tipo no meio de muitas outras, com rapidez.'
    };

    const RAVLT = {
        A1: 'Primeira vez que a lista de 15 palavras é lida: mostra quanto a pessoa guarda logo de cara.',
        A2: 'Segunda leitura da mesma lista: mostra se a repetição já ajuda.',
        A3: 'Terceira leitura: a lista vai ficando mais conhecida.',
        A4: 'Quarta leitura: o aprendizado continua crescendo.',
        A5: 'Quinta leitura: mostra até onde a pessoa chega com repetição.',
        B1: 'Uma lista nova, lida uma vez só, para “atrapalhar” a primeira.',
        A6: 'Lembrar a primeira lista logo depois da lista nova, sem ler de novo: mostra se a informação resistiu à interferência.',
        A7: 'Lembrar a primeira lista depois de uns 20 minutos: mostra se a informação ficou guardada.'
    };
    const RAVLT_VIDA = {
        dificuldade: 'Neste ponto {nome} lembrou menos palavras do que o esperado para a idade.',
        esperado: 'Neste ponto {nome} lembrou o esperado para a idade.',
        forte: 'Neste ponto {nome} lembrou mais palavras do que o esperado para a idade.'
    };

    const FDT = {
        L: { oque: 'Ler números simples o mais rápido possível.', area: 'a rapidez para ler e reconhecer símbolos simples' },
        C: { oque: 'Contar quantos símbolos há em cada quadro, o mais rápido possível.', area: 'a rapidez para contar e processar informação simples' },
        E: { oque: 'Dizer a quantidade de números em vez de ler o número, o que exige frear a resposta automática.', area: 'segurar o impulso de dar a resposta automática' },
        A: { oque: 'Ir alternando entre ler e contar, trocando a regra a cada quadro.', area: 'trocar de regra e de estratégia com rapidez' },
        CI: { oque: 'Controle inibitório: frear a resposta automática para dar a resposta certa. Ex.: não falar na hora errada, esperar a vez.', area: 'segurar o impulso e pensar antes de agir' },
        FC: { oque: 'Flexibilidade: mudar de regra ou de estratégia quando a situação pede. Ex.: mudar de atividade ou de plano.', area: 'mudar de estratégia quando algo não dá certo' }
    };

    const BFP = {
        N: { oque: 'Neuroticismo: o quanto a pessoa sente as emoções difíceis, como preocupação, tristeza e irritação. É um traço de personalidade, e não um diagnóstico.',
            alto: '{nome} tende a sentir mais intensamente preocupações e emoções difíceis.', medio: '{nome} sente as emoções difíceis em intensidade parecida com a maioria das pessoas.', baixo: '{nome} tende a ficar mais tranquilo(a) diante de pressão e preocupações.' },
        E: { oque: 'Extroversão: o quanto a pessoa busca contato social e se sente à vontade em grupo.',
            alto: '{nome} tende a gostar de estar com pessoas e a se comunicar com facilidade.', medio: '{nome} equilibra momentos com pessoas e momentos mais reservados.', baixo: '{nome} tende a ser mais reservado(a) e a preferir grupos menores.' },
        S: { oque: 'Socialização: tendência a cooperar, confiar nos outros e cuidar das relações.',
            alto: '{nome} tende a ser cooperativo(a) e atento(a) aos outros.', medio: '{nome} coopera e confia nos outros como a maioria das pessoas.', baixo: '{nome} tende a ser mais desconfiado(a) ou competitivo(a) nas relações.' },
        R: { oque: 'Realização: tendência a ser organizado, persistente e disciplinado para cumprir metas.',
            alto: '{nome} tende a ser organizado(a) e persistente com as metas.', medio: '{nome} se organiza e persiste como a maioria das pessoas.', baixo: '{nome} pode ter mais dificuldade para se organizar e manter a disciplina nas tarefas.' },
        A: { oque: 'Abertura: interesse por ideias novas, curiosidade e gosto por experiências diferentes.',
            alto: '{nome} tende a ser curioso(a) e a gostar de novidades.', medio: '{nome} equilibra o gosto por novidades e por rotina.', baixo: '{nome} tende a preferir o que já conhece e a rotina.' }
    };

    // Subescalas de escalas: reconhecidas pelo nome (sem acento, minúsculas).
    const ESCALAS = [
        [/desaten/, 'Sinais como se distrair fácil, perder objetos, não terminar tarefas e parecer não ouvir quando falam com a pessoa.'],
        [/hiperativ|impulsiv/, 'Sinais como agitação, dificuldade de esperar a vez, falar demais e agir sem pensar.'],
        [/oposi|desafi/, 'Sinais como discutir com adultos, desobedecer regras de propósito e se irritar com facilidade.'],
        [/panico|somatic/, 'Sinais físicos de ansiedade, como coração acelerado, falta de ar ou dor de barriga em situações de medo.'],
        [/generaliz/, 'Preocupação com muitas coisas ao mesmo tempo, difícil de controlar, como provas, saúde ou o futuro.'],
        [/separa/, 'Medo de ficar longe dos pais ou de pessoas próximas, como na hora de ir à escola ou dormir fora.'],
        [/fobia social|social.*ansied|timidez/, 'Desconforto ou medo em situações com outras pessoas, como falar em público ou conhecer gente nova.'],
        [/escolar/, 'Medo ou recusa de ir à escola.'],
        [/percep.*social/, 'Perceber os sinais sociais, como expressões do rosto e tom de voz.'],
        [/cogni.*social/, 'Entender o que os outros pensam e sentem e interpretar situações sociais.'],
        [/comunica.*social|intera/, 'Usar a conversa e os gestos para se relacionar, como manter um diálogo de ida e volta.'],
        [/motiva.*social/, 'Vontade de buscar e manter contato com outras pessoas.'],
        [/restrit|repetit|estereot/, 'Interesses muito intensos ou fixos, rotinas rígidas e movimentos ou falas repetidas.'],
        [/concentrad/, 'Manter o foco numa coisa só por um tempo, sem se distrair.'],
        [/dividid/, 'Prestar atenção em duas coisas ao mesmo tempo, como ouvir e escrever.'],
        [/alternad/, 'Trocar o foco de uma tarefa para outra e voltar.'],
        [/depress/, 'Sinais de tristeza, desânimo, cansaço e perda de interesse pelas coisas.'],
        [/ansied/, 'Sinais de ansiedade, como nervosismo, tensão e preocupação.'],
        [/total|geral/, 'O resumo de todos os itens da escala.']
    ];
    const ESC_VIDA = {
        dificuldade: 'Nesta parte, o resultado ficou fora do esperado e merece atenção no dia a dia de {nome}.',
        esperado: 'Nesta parte, o resultado ficou dentro do esperado.'
    };

    const sem = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const com = (t, nome) => String(t || '').replace(/\{nome\}/g, nome || 'a pessoa');

    /** Nível a partir do rótulo da classificação (desempenho: maior é melhor). */
    function nivelRotulo(rot) {
        const t = sem(rot);
        if (!t) return null;
        if (/inferior|limitrofe|baixo|deficit|dificuldade|prejuizo/.test(t) && !/medio superior/.test(t)) return 'dificuldade';
        if (/superior|alto|elevad/.test(t)) return 'forte';
        if (/medio|media|normal|esperado/.test(t)) return 'esperado';
        return null;
    }
    const nivelComp = v => v == null ? null : v < 90 ? 'dificuldade' : v >= 110 ? 'forte' : 'esperado';
    const nivelPond = p => p == null ? null : p <= 7 ? 'dificuldade' : p >= 12 ? 'forte' : 'esperado';   // igual às faixas do ponderado (12+ = Médio Superior)
    const nivelTom = t => t === 'ok' ? 'esperado' : (t === 'leve' || t === 'mod' || t === 'grave') ? 'dificuldade' : null;
    const nivelPct = p => p == null ? null : p < 25 ? 'baixo' : p > 75 ? 'alto' : 'medio';

    /** { oque, vida } para a chave da medida, ou null. */
    function de(chave, nivel, nome) {
        const [tipo, cod] = [String(chave || '').split(':')[0], String(chave || '').split(':').slice(1).join(':')];
        if (tipo === 'idx' && IDX[cod]) return { oque: IDX[cod].oque, vida: nivel && IDX[cod][nivel] ? com(IDX[cod][nivel], nome) : '' };
        if (tipo === 'sub' && SUB[cod]) {
            const v = { dificuldade: `Nesta tarefa {nome} ficou abaixo da média para a idade.`, esperado: `Nesta tarefa {nome} ficou na média para a idade.`, forte: `Nesta tarefa {nome} ficou acima da média para a idade.` };
            return { oque: SUB[cod], vida: nivel ? com(v[nivel], nome) : '' };
        }
        if (tipo === 'ravlt' && RAVLT[cod]) return { oque: RAVLT[cod], vida: nivel ? com(RAVLT_VIDA[nivel], nome) : '' };
        if (tipo === 'fdt') {
            const k = String(cod).replace(/\s.*$/, ''); const f = FDT[k]; if (!f) return null;
            const v = { dificuldade: `{nome} levou mais tempo que o esperado aqui. No dia a dia, isso pode aparecer em ${f.area}.`, esperado: `Aqui {nome} ficou dentro do esperado para a idade.`, forte: `Aqui {nome} foi mais rápido(a) que o esperado para a idade.` };
            return { oque: f.oque, vida: nivel ? com(v[nivel], nome) : '' };
        }
        if (tipo === 'bfp' && BFP[cod]) return { oque: BFP[cod].oque, vida: nivel ? com(BFP[cod][nivel], nome) : '' };
        if (tipo === 'esc') {
            const n = sem(cod), e = ESCALAS.find(x => x[0].test(n));
            return { oque: e ? e[1] : 'Parte da escala respondida. Quanto mais longe da faixa esperada, mais atenção essa área merece.', vida: nivel && ESC_VIDA[nivel] ? com(ESC_VIDA[nivel], nome) : '' };
        }
        return null;
    }

    window.LaudoExplica = { de, nivelRotulo, nivelComp, nivelPond, nivelTom, nivelPct };
})();
