import Foundation
import SwiftUI

struct PlayingCard: Codable, Hashable {
    let rank: Int
    let suit: Int
    var symbol: String { ["♠", "♥", "♦", "♣"][min(max(suit, 0), 3)] }
    var label: String { [11:"J",12:"Q",13:"K",14:"A"][rank] ?? String(rank) }
    var red: Bool { suit == 1 || suit == 2 }
    func spokenName(language:String) -> String {
        let portuguese=language=="pt"
        let ranks=portuguese ? [11:"Valete",12:"Dama",13:"Rei",14:"Ás"] : [11:"Jack",12:"Queen",13:"King",14:"Ace"]
        let suits=portuguese ? ["espadas","copas","ouros","paus"] : ["spades","hearts","diamonds","clubs"]
        return (ranks[rank] ?? String(rank))+(portuguese ? " de ":" of ")+suits[min(max(suit,0),3)]
    }
}
struct Seat: Codable, Identifiable {
    let id: String
    let name: String
    let stack: Int
    let bet: Int
    let folded: Bool
    let bot: Bool
    let cards: [PlayingCard]
}
struct Refund: Codable { let id: String; let amount: Int }
struct Winner: Codable { let id: String; let amount: Int; let category: Int }
struct TableEvent: Codable { let name: String; let action: String; let amount: Int }
struct PokerTable: Codable {
    let code: String
    let host: String
    let practice: Bool
    let phase: String
    let board: [PlayingCard]
    let dealer: Int
    let actor: Int
    let currentBet: Int
    let minRaise: Int
    let hand: Int
    let version: Int
    let winners: [Winner]
    let refunds: [Refund]
    let log: [TableEvent]
    let deadline: Double
    let pot: Int
    let canRaise: Bool
    /// Category of your own best hand once the flop is out, otherwise -1.
    let handCategory: Int
    let players: [Seat]
    var betweenHands: Bool { phase == "waiting" || phase == "showdown" }
    func suggestedRaise(for player: Seat, fraction: Double) -> Int {
        let maximum=player.bet+player.stack
        let call=max(0,currentBet-player.bet)
        let increment=max(minRaise,Int((Double(pot+call)*fraction).rounded()))
        return min(maximum,currentBet+increment)
    }
}
@MainActor final class Preferences: ObservableObject {
    @Published var language: String { didSet { UserDefaults.standard.set(language, forKey: "language") } }
    @Published var appearance: String { didSet { UserDefaults.standard.set(appearance, forKey: "appearance") } }
    init() {
        language = UserDefaults.standard.string(forKey: "language") ?? "pt"
        appearance = UserDefaults.standard.string(forKey: "appearance") ?? "system"
    }
    var scheme: ColorScheme? { appearance == "dark" ? .dark : appearance == "light" ? .light : nil }
    func text(_ pt: String, _ en: String) -> String { language == "pt" ? pt : en }
    func phase(_ value: String) -> String {
        switch value {
        case "waiting": return text("À espera de jogadores", "Waiting for players")
        case "preflop": return text("Pré-flop", "Preflop")
        case "showdown": return text("Resultado da mão", "Hand result")
        default: return value.capitalized
        }
    }
    func action(_ value: String) -> String {
        switch value {
        case "fold": return text("Desistiu", "Folded")
        case "check": return text("Passou", "Checked")
        case "call": return text("Pagou", "Called")
        case "bet": return text("Apostou", "Bet")
        default: return text("Aumentou", "Raised")
        }
    }
    func category(_ value: Int) -> String {
        let pt = ["Carta alta", "Par", "Dois pares", "Trio", "Sequência", "Cor", "Full house", "Poker", "Sequência de cor"]
        let en = ["High card", "Pair", "Two pair", "Three of a kind", "Straight", "Flush", "Full house", "Four of a kind", "Straight flush"]
        return value < 0 ? text("Todos desistiram", "Everyone folded") : (language == "pt" ? pt : en)[min(value,8)]
    }
    func error(_ code: String) -> String {
        switch code {
        case "not_configured": return text("O serviço online ainda não está configurado nesta versão.", "Online services have not been configured in this build.")
        case "stale_state": return text("A mesa mudou. Confirma a jogada e tenta novamente.", "The table changed. Check your action and try again.")
        case "need_players": return text("São necessários pelo menos dois jogadores com fichas.", "At least two players with chips are needed.")
        case "finish_hand_first": return text("Termina esta mão antes de sair ou eliminar a conta.", "Finish this hand before leaving or deleting your account.")
        case "table_not_found", "not_found": return text("Mesa não encontrada. Confirma o código.", "Table not found. Check the code.")
        case "hand_in_progress": return text("A mão já começou. Aguarda pela próxima.", "The hand has started. Wait for the next one.")
        case "table_full": return text("Esta mesa já tem seis jogadores.", "This table already has six players.")
        case "authentication_required": return text("A sessão terminou. Entra novamente.", "Your session expired. Sign in again.")
        case "too_many_requests": return text("Demasiadas tentativas. Aguarda um minuto.", "Too many attempts. Wait a minute.")
        case "deletion_unavailable": return text("A eliminação de conta está indisponível. Contacta ividi.dev@gmail.com.", "Account deletion is unavailable. Contact ividi.dev@gmail.com.")
        case "invalid_credentials", "invalid_grant": return text("Verifica o email e a palavra-passe.", "Check your email and password.")
        case "email_not_confirmed": return text("Confirma primeiro o email que recebeste.", "Confirm the email you received first.")
        case "weak_password": return text("Usa uma palavra-passe com pelo menos 8 caracteres.", "Use a password with at least 8 characters.")
        case "cancelled": return text("Início de sessão cancelado.", "Sign-in cancelled.")
        case "raise_too_small", "invalid_raise": return text("Escolhe um aumento válido ou aposta todas as fichas.", "Choose a valid raise or go all-in.")
        case "not_your_turn": return text("Aguarda pela tua vez.", "Wait for your turn.")
        case "already_at_table": return text("Já estás sentado noutra mesa. Sai dela primeiro.", "You are already seated at another table. Leave it first.")
        case "private_practice": return text("As mesas de treino são individuais.", "Practice tables are single-player.")
        case "table_busy", "account_busy": return text("A mesa está a ser atualizada. Tenta daqui a pouco.", "The table is being updated. Try again shortly.")
        case "server_full": return text("O servidor está cheio. Tenta mais tarde.", "The server is full. Try again later.")
        case "deletion_failed": return text("Não foi possível eliminar a conta. Tenta novamente.", "Your account could not be deleted. Try again.")
        case "user_already_exists", "email_exists": return text("Já existe uma conta com este email. Entra ou recupera a palavra-passe.", "An account with this email already exists. Sign in or reset your password.")
        case "email_address_invalid", "validation_failed": return text("Confirma que o email está correto.", "Check that the email address is correct.")
        case "otp_expired": return text("O código expirou ou está incorreto. Pede um novo.", "The code is invalid or has expired. Request a new one.")
        case "same_password": return text("Escolhe uma palavra-passe diferente da anterior.", "Choose a password different from your previous one.")
        case "over_email_send_rate_limit", "over_request_rate_limit": return text("Demasiados pedidos. Aguarda alguns minutos.", "Too many requests. Wait a few minutes.")
        default: return text("Não foi possível concluir. Verifica a ligação e tenta novamente.", "Could not complete the request. Check your connection and try again.")
        }
    }
}
struct ServiceError: Error {
    let code: String
}
enum AppConfiguration {
    static func value(_ key: String) -> String { Bundle.main.object(forInfoDictionaryKey: key) as? String ?? "" }
    static var authURL: String { value("SupabaseURL").trimmingCharacters(in:CharacterSet(charactersIn:"/ \n")) }
    static var apiURL: String { value("PokerAPIURL").trimmingCharacters(in:CharacterSet(charactersIn:"/ \n")) }
    static var key: String { value("SupabaseAnonKey") }
    static func validHTTPS(_ value: String) -> Bool {
        guard let url=URLComponents(string:value) else {return false}
        return url.scheme=="https" && !(url.host ?? "").isEmpty && url.user==nil && url.password==nil && url.query==nil && url.fragment==nil
    }
    static var ready: Bool { validHTTPS(authURL) && validHTTPS(apiURL) && !key.isEmpty }
}
