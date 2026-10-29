import Foundation

@main struct NativeChecks {
    static func main() throws {
        var checks=0
        func check(_ condition: @autoclosure () -> Bool,_ description:String) {
            guard condition() else {fatalError(description)}
            checks+=1
        }
        let directory=URL(fileURLWithPath:CommandLine.arguments[1])
        let decoder=JSONDecoder()
        let live=try decoder.decode(PokerTable.self,from:Data(contentsOf:directory.appendingPathComponent("live.json")))
        check(live.phase=="preflop","Live server phase must decode")
        check(live.players.count==3,"Three-player snapshot")
        check(live.players[0].cards.count==2,"Own cards available")
        check(live.players.dropFirst().allSatisfy{$0.cards.isEmpty},"Private opponent cards")
        check(live.suggestedRaise(for:live.players[0],fraction:0.5)==45,"Half-pot raise includes the call")
        check(live.suggestedRaise(for:live.players[0],fraction:1)==70,"Pot raise includes the call")
        let short=Seat(id:"short",name:"Short",stack:30,bet:0,folded:false,bot:false,cards:[])
        check(live.suggestedRaise(for:short,fraction:1)==30,"Quick raise is capped at the stack")
        check(live.suggestedRaise(for:live.players[0],fraction:0)==40,"Quick raise respects the minimum")
        let settled=try decoder.decode(PokerTable.self,from:Data(contentsOf:directory.appendingPathComponent("settled.json")))
        check(settled.betweenHands,"Showdown is between hands")
        check(settled.refunds.first?.amount==100,"Uncalled bet contract")
        check(settled.winners.count==2,"Refund is separate from won pots")
        check(settled.players.map(\.stack)==[300,200,100],"Native snapshot retains correct payouts")
        check(PlayingCard(rank:14,suit:1).spokenName(language:"pt")=="Ás de copas","Portuguese card accessibility")
        check(PlayingCard(rank:12,suit:3).spokenName(language:"en")=="Queen of clubs","English card accessibility")
        check(AppConfiguration.validHTTPS("https://poker.example.com"),"Accept HTTPS endpoint")
        for invalid in ["http://poker.example.com","https://","https://user:secret@example.com","https://example.com?key=value","https://example.com#fragment"] {
            check(!AppConfiguration.validHTTPS(invalid),"Reject unsafe or malformed endpoint")
        }
        let user=AccountUser(id:"test-user",email:nil)
        let fresh=Session(access_token:"test",refresh_token:"test",expires_in:3600,user:user,savedAt:Date())
        let expired=Session(access_token:"test",refresh_token:"test",expires_in:3600,user:user,savedAt:Date(timeIntervalSinceNow:-3601))
        check(!fresh.expiredSoon,"Fresh access token")
        check(expired.expiredSoon,"Expired access token")
        let unknownAge=Session(access_token:"test",refresh_token:"test",expires_in:3600,user:user,savedAt:nil)
        check(unknownAge.expiredSoon,"Sessions without age must refresh")
        print("Native checks passed: \(checks)")
    }
}
