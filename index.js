let fs = require('fs')
let path = reqiure('path')
let { Promise } = require('es6-promise')


// TODO
function get_file_list(src_path, config){
    "return relative path base on src_path and dst_path."
    return []
}

function read_file(src_path){
    return new Promise((resolve, reject)=>{
	fs.readFile(src_path, (err, data)=>{
	    if(err){ reject(err) }
	    else { resolve(data) }
	})
    })
}
function write_file(dst_path, data){
    return new Promise((resolve, reject)=>{
	fs.writeFIle(dst_path, data, (err)=>{
	    if(err) { reject(err) }
	    else { resolve(dst_path) }
	})
    })
}
// TODO
function parse_file(content){ return [] }
// TODO
function trans_block(block, db){ return block }

function trans_file(file_path, src_path, dst_path, db){
    let srcf = path.join(src_path, file_path)
    let dstf = path.join(dst_path, file_path)
    return read_file(srcf).then(content=>parse_file(content)).then(block_list=>{
	return Promise.all(block_list.map(block=>trans_block(block, db)))
    }).then(transed_block_list=>write_file(dstf, transed_block_list.join('')))
}

// TODO
function make_html(dst_path){
    return 'make'
}

// TODO
function connect_db(db_config){
    return 'db'
}
// TODO
function reinit_db(db, src_path, db_config, config){
}

function init(src_path, db_config, config){
    return connct_db(db_config).then(db=>{
	return reinit_db(db, src_path, db_config, config)
    })
}

function main(src_path, dst_path, db_config, config){
    return get_file_list(src_path, config).then(file_list=>{
	return connect_db(db_config).then(db=>{
	    return Promise.all(file_list.map(file_path=>trans_file(file_path, src_path, dst_path, db)))
	})
    }).then(a=>make_html(dst_path)).catch(console.log)
}
