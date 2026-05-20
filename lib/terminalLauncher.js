// Liste de candidats terminal emulator -> argv à exécuter pour ouvrir une
// commande dans une fenêtre/onglet. Ordonné par préférence pragmatique :
// ptyxis (terminal par défaut sur Fedora Workstation récent) d'abord, puis
// les autres GNOME-natifs, puis les indépendants. Pure : ne fait pas d'IO.

// Pour ptyxis on utilise `--tab` : si une fenêtre ptyxis existe déjà, on
// ouvre un nouvel onglet dedans, sinon une nouvelle fenêtre. La commande
// est passée directement, sans wrap shell (claude tourne ; Ctrl-D ferme
// l'onglet, ce qui colle avec l'idée "1 session = 1 onglet").
//
// Pour les autres, on garde un wrap `sh -c '<cmd>; exec $SHELL'` qui
// maintient une session shell après que la commande se termine, pour les
// terminaux qui fermeraient la fenêtre sinon.
export function candidateArgvs(cmd) {
    const keep = `${cmd}; exec "${'${SHELL:-bash}'}"`;
    return [
        ['ptyxis', '--tab', '--', cmd],
        ['gnome-terminal', '--', 'sh', '-c', keep],
        ['kgx', '--', 'sh', '-c', keep],
        ['ghostty', '-e', 'sh', '-c', keep],
        ['foot', 'sh', '-c', keep],
        ['kitty', 'sh', '-c', keep],
        ['alacritty', '-e', 'sh', '-c', keep],
        ['wezterm', 'start', '--', 'sh', '-c', keep],
        ['konsole', '-e', 'sh', '-c', keep],
        ['tilix', '-e', 'sh', '-c', keep],
        ['xterm', '-e', 'sh', '-c', keep],
    ];
}
