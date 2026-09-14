// Deterministic candidate search. Finalists are re-evaluated by the site's JS engine.
#include <algorithm>
#include <array>
#include <cmath>
#include <fstream>
#include <iostream>
#include <numeric>
#include <random>
#include <set>
#include <vector>
#include <omp.h>
using W=std::array<int,10>;
struct Race{int date,n,k;int number[20];double odds[20],prob[20],f[20][10],q[20][20],paid[20][20];};
struct Result{W w;int mode,lo,hi,n,hits;double paid;double value()const{return n?paid/n:0;}};
std::vector<Race> races;
std::vector<Result> evaluate(W w,bool existing=false){
 double paid[2][21][21]={};int count[2][21][21]={},hits[2][21][21]={};
 for(const auto&r:races){
  double score[20];int rank[20],active=0;double sum=std::accumulate(w.begin(),w.end(),0.0),mean=0;
  for(int i=0;i<r.n;i++){if(r.odds[i]>=1)rank[active++]=i;score[i]=0;for(int j=0;j<10;j++)score[i]+=r.f[i][j]*w[j]/sum;score[i]*=6.28;mean+=score[i];}
  mean/=r.n;for(int i=0;i<r.n;i++)score[i]=existing?r.prob[i]:std::exp(std::max(-4.0,std::min(4.0,(score[i]-mean)*.6)));
  auto better=[&](int a,int b){return b<0||score[a]>score[b]||(score[a]==score[b]&&r.number[a]<r.number[b]);};
  std::sort(rank,rank+active,[&](int a,int b){return r.odds[a]!=r.odds[b]?r.odds[a]<r.odds[b]:better(a,b);});
  int analysis=rank[0];for(int j=1;j<active;j++){int i=rank[j];if(better(i,analysis))analysis=i;}
  for(int mode=0;mode<2;mode++){
   int anchor=mode?analysis:rank[0];
   for(int lo=2;lo<=active;lo++){int partner=-1;
    for(int hi=lo;hi<=20;hi++){
     if(hi<=active){int c=rank[hi-1];if(c!=anchor&&(partner<0||(existing?(r.q[anchor][c]>r.q[anchor][partner]||(r.q[anchor][c]==r.q[anchor][partner]&&better(c,partner))):better(c,partner))))partner=c;}
     if(partner>=0){count[mode][lo][hi]++;paid[mode][lo][hi]+=r.paid[anchor][partner];hits[mode][lo][hi]+=r.paid[anchor][partner]>0;}
    }
   }
  }
 }
 std::vector<Result> out;for(int m=0;m<2;m++)for(int l=2;l<=20;l++)for(int h=l;h<=20;h++)if(count[m][l][h])out.push_back({w,m,l,h,count[m][l][h],hits[m][l][h],paid[m][l][h]});return out;
}
int main(int argc,char**argv){
 std::ifstream in(argv[1]);int n;in>>n;races.resize(n);for(auto&r:races){in>>r.date>>r.n>>r.k;for(int i=0;i<r.n;i++){in>>r.number[i]>>r.odds[i]>>r.prob[i];for(double&x:r.f[i])in>>x;}for(int i=0;i<r.n;i++)for(int j=0;j<r.n;j++)in>>r.q[i][j]>>r.paid[i][j];}if(!in)return 2;
 std::mt19937 rng(20260914);std::set<W> seen;std::vector<Result> global,wide;int tested=0;
 auto trim=[](std::vector<Result>&v){std::sort(v.begin(),v.end(),[](const Result&a,const Result&b){if(a.value()!=b.value())return a.value()>b.value();if(a.n!=b.n)return a.n>b.n;return a.w<b.w;});std::set<W> keep;v.erase(std::remove_if(v.begin(),v.end(),[&](const Result&r){return !keep.insert(r.w).second;}),v.end());if(v.size()>30)v.resize(30);};
 auto batch=[&](std::vector<W> list){std::vector<W> unique;for(auto w:list)if(seen.insert(w).second)unique.push_back(w);std::vector<std::vector<Result>> all(unique.size());
  #pragma omp parallel for schedule(dynamic)
  for(size_t i=0;i<unique.size();i++)all[i]=evaluate(unique[i]);
  for(auto&v:all){for(auto&r:v){global.push_back(r);if(r.n>=int(n*.8))wide.push_back(r);}trim(global);trim(wide);}tested+=unique.size();std::cerr<<"Tested "<<tested<<" weights; best "<<global[0].value()<<" n="<<global[0].n<<"; broad "<<wide[0].value()<<"\n";
 };
 std::vector<W> initial={{33,9,18,12,10,6,4,3,3,2}};
 for(int i=0;i<10;i++){W w={};w[i]=100;initial.push_back(w);for(int j=i+1;j<10;j++)for(int a=10;a<100;a+=10){W x={};x[i]=a;x[j]=100-a;initial.push_back(x);}}
 for(int k=0;k<700;k++){double a[10],total=0;for(int i=0;i<10;i++){a[i]=std::pow(-std::log((rng()+1.0)/(rng.max()+2.0)),k%3+1);total+=a[i];}W w={};int used=0;for(int i=0;i<10;i++){w[i]=int(a[i]*100/total);used+=w[i];}while(used++<100)w[rng()%10]++;initial.push_back(w);}
 batch(initial);
 for(int step:{10,5,2,1})for(int round=0;round<2;round++){
  std::vector<W> candidates;for(auto*board:{&global,&wide})for(int b=0;b<std::min(5,int(board->size()));b++)for(int i=0;i<10;i++)for(int j=0;j<10;j++)if(i!=j&&(*board)[b].w[i]>=step){W w=(*board)[b].w;w[i]-=step;w[j]+=step;candidates.push_back(w);}batch(candidates);
 }
 std::ofstream out(argv[2]);out<<"{\"seed\":20260914,\"weightCandidates\":"<<tested<<",\"rangeCombinationsPerWeight\":380,\"finalists\":[";bool first=true;std::set<W> emitted;for(auto*board:{&global,&wide})for(const auto&r:*board)if(emitted.insert(r.w).second){if(!first)out<<',';first=false;out<<"{\"weights\":[";for(int i=0;i<10;i++){if(i)out<<',';out<<r.w[i];}out<<"],\"proxyProduct\":"<<r.value()<<'}';}out<<"]}\n";
}
